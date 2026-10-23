import moment from "moment-timezone";

import { AppError } from "../utils/AppError.js";
import {
  assertCanReceive,
  assertCanSpend,
  getAssetBalance,
  validateAsset,
} from "./assets.service.js";
import { validateCategory } from "./categories.service.js";
import { transactBill } from "./recurring.service.js";

import { prisma } from "../config/prisma.js";
import {
  billedInstallmentCount,
  creditDueDate,
  dayInMonth,
  lastStatementClose,
} from "../utils/creditCycle.js";

/*
|--------------------------------------------------------------------------
| Scheduled Transactions
|--------------------------------------------------------------------------
| One feed for everything that is due on a date, regardless of where it comes
| from. Every item has the same shape so the calendar / dashboard don't need
| to know the source:
|
|   RECURRING         -> RecurringTransaction (Expense | Income | Transfer).
|                        The cycle on nextDueDate is the actionable one; later
|                        cycles inside the requested range are projections.
|   CREDIT_STATEMENT  -> CreditStatement (credit card bill). Generated here
|                        from CreditDetail.statementDate / dueDate once a cycle
|                        closes; the upcoming cycle is shown as a projection.
|
| Adding loans later = another source that maps LoanInstallment to this shape.
*/

const OPEN_STATEMENT_STATUSES = ["PENDING", "PARTIAL", "OVERDUE"];

// A card can bill statements once it has a statement day and a due rule: a
// day of the month, or a number of days after the statement date.
const CREDIT_DETAIL_READY = {
  statementDate: { not: null },
  OR: [{ dueDate: { not: null } }, { dueDaysAfterStatement: { not: null } }],
};

// Accounts a card bill can be paid from (not another card or a loan).
const PAYMENT_SOURCE_CATEGORIES = ["CASH", "BANK"];

// How many missed statement cycles to create at once for a card.
const MAX_STATEMENT_BACKFILL = 12;

// Safety cap so a daily schedule over a huge range can't explode the response.
const MAX_OCCURRENCES_PER_ITEM = 400;

const categorySelect = { id: true, name: true, icon: true, color: true };
const assetSelect = { id: true, name: true, category: true, color: true };

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/
const getTimezone = async (userId) => {
  const settings = await prisma.settings.findFirst({
    where: { userId: Number(userId) },
    select: { timezone: true },
  });
  return settings?.timezone || "UTC";
};

const getAssetRemainingBalance = async (userId, assetId, options) => {
  if (!assetId) return null;
  const result = await getAssetBalance(userId, assetId, options);
  return result?.data?.[0] ?? null;
};

// Recurring items store their account differently per type (Income used
// toAsset before, fromAsset now), so resolve it in one place.
const getRecurringAccount = (item) =>
  item.type === "Income" ? (item.fromAsset ?? item.toAsset) : item.fromAsset;

// Same anchoring rule as the cron: occurrence k = startDate + k * interval.
const occurrence = (item, k, timezone) =>
  moment
    .tz(item.startDate, timezone)
    .startOf("day")
    .add(k * item.interval, item.unit);

const inRange = (date, from, to) =>
  (!from || !moment(date).isBefore(from)) && (!to || !moment(date).isAfter(to));

const priorityRank = (item, today) => {
  if (item.needsAttention) return 0; // failed auto-log
  if (moment(item.dueDate).isBefore(today, "day")) return 1; // overdue
  return 2; // due today / upcoming
};

export const resolveTransferCategory = async (userId, categoryId) => {
  if (categoryId) {
    await validateCategory(categoryId);
    return Number(categoryId);
  }

  const category = await prisma.categories.findFirst({
    where: {
      isActive: true,
      type: { equals: "Transfer", mode: "insensitive" },
      OR: [{ userId: null }, { userId: Number(userId) }],
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  if (!category)
    throw new AppError("No transfer category available for this payment", 400);
  return category.id;
};

/*
|--------------------------------------------------------------------------
| Credit statements
|--------------------------------------------------------------------------
*/

// Sum of payments into the card after the statement closed. Counts every
// transfer to the card (not just ones linked via creditStatementId) so
// payments made from the regular transfer form also settle the bill.
const getStatementPayments = async (statement, assetId, timezone) =>
  prisma.transfer.findMany({
    where: {
      toAssetId: assetId,
      isActive: true,
      status: "Completed",
      date: {
        gt: moment(statement.statementDate).tz(timezone).endOf("day").toDate(),
      },
    },
    select: {
      id: true,
      amount: true,
      date: true,
      description: true,
      fromAsset: { select: assetSelect },
    },
    orderBy: { date: "desc" },
  });

// Interest and fees entered from the bank statement; they're owed on top of
// the statement balance.
const statementFees = (statement) =>
  Number(statement.interestCharged ?? 0) +
  Number(statement.lateFeeCharged ?? 0) +
  Number(statement.otherFees ?? 0);

// What a statement still asks for: its fixed balance and fees less payments,
// but never more than the card actually owes for billed charges. This is what
// settles a bill after a refund or an archived purchase, without touching the
// statement's own balance.
const statementRemaining = (statement, amountPaid, owedCap = Infinity) => {
  const balance = Number(statement.statementBalance) + statementFees(statement);
  return Math.max(Math.min(balance - amountPaid, owedCap), 0);
};

const statementStatus = (statement, amountPaid, today, owedCap) => {
  if (statementRemaining(statement, amountPaid, owedCap) <= 0) return "PAID";
  if (moment(statement.dueDate).isBefore(today, "day")) return "OVERDUE";
  if (amountPaid > 0) return "PARTIAL";
  return "PENDING";
};

/**
 * Creates the statement for the most recently closed cycle of each credit
 * card (if missing) and refreshes the status of open statements. Idempotent,
 * so it is safe to call on read and from the cron.
 */
export const syncCreditStatements = async (userId, timezone) => {
  const tz = timezone || (await getTimezone(userId));
  const today = moment().tz(tz).startOf("day");

  const cards = await prisma.asset.findMany({
    where: {
      userId: Number(userId),
      isActive: true,
      category: "CREDIT",
      creditDetail: CREDIT_DETAIL_READY,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      openedAt: true,
      creditDetail: true,
    },
  });

  for (const card of cards) {
    const { creditDetail } = card;
    const openedOn = moment(card.openedAt ?? card.createdAt)
      .tz(tz)
      .startOf("day");

    // Every cycle that closed since the card existed (newest first), so a
    // cycle missed while the app/cron was off is still billed. A card didn't
    // exist yet for cycles that closed before it was opened.
    const closeDates = [];
    let close = lastStatementClose(today, creditDetail.statementDate);
    while (
      !close.isBefore(openedOn) &&
      closeDates.length < MAX_STATEMENT_BACKFILL
    ) {
      closeDates.push(close);
      close = lastStatementClose(
        close.clone().subtract(1, "day"),
        creditDetail.statementDate,
      );
    }

    const existing = await prisma.creditStatement.findMany({
      where: {
        creditDetailId: creditDetail.id,
        statementDate: { in: closeDates.map((d) => d.toDate()) },
      },
      select: { statementDate: true },
    });
    const existingTimes = new Set(
      existing.map((e) => e.statementDate.getTime()),
    );

    for (const closeDate of closeDates.filter(
      (d) => !existingTimes.has(d.toDate().getTime()),
    )) {
      const asset = await getAssetRemainingBalance(userId, card.id, {
        asOf: closeDate.clone().endOf("day").toDate(),
      });
      const unbilled = await getUnbilledPrincipal(
        creditDetail.id,
        closeDate,
        tz,
      );
      const statementBalance = Math.max(
        Number(asset?.remainingBalance ?? 0) - unbilled,
        0,
      );

      await prisma.creditStatement.createMany({
        data: [
          {
            creditDetailId: creditDetail.id,
            statementDate: closeDate.toDate(),
            dueDate: creditDueDate(closeDate, creditDetail).toDate(),
            statementBalance,
            status: statementBalance > 0 ? "PENDING" : "PAID",
          },
        ],
        skipDuplicates: true, // concurrent request/cron already created it
      });
    }

    const unattached = await prisma.creditInstallment.findMany({
      where: {
        statementId: null,
        plan: { creditDetailId: creditDetail.id, status: { not: "CANCELLED" } },
      },
    });

    for (const item of unattached) {
      const dueMonth = moment.tz(item.dueDate, tz).startOf("month");

      const statement = await prisma.creditStatement.findFirst({
        where: {
          creditDetailId: creditDetail.id,
          dueDate: {
            gte: dueMonth.toDate(),
            lt: dueMonth.clone().add(1, "month").toDate(),
          },
        },
      });
      if (statement) {
        await prisma.creditInstallment.update({
          where: { id: item.id },
          data: { statementId: statement.id },
        });
      }
    }

    // Refresh status of open statements from actual payments.
    const openStatements = await prisma.creditStatement.findMany({
      where: {
        creditDetailId: creditDetail.id,
        status: { in: OPEN_STATEMENT_STATUSES },
      },
    });

    const owedCap = openStatements.length
      ? await getBilledOwed(userId, card.id, creditDetail.id, tz)
      : Infinity;

    for (const statement of openStatements) {
      const payments = await getStatementPayments(statement, card.id, tz);
      const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const status = statementStatus(statement, amountPaid, today, owedCap);

      if (status !== statement.status) {
        await prisma.creditStatement.update({
          where: { id: statement.id },
          data: { status },
        });
      }
    }

    // A newer statement's balance already includes anything still unpaid from
    // older ones, so once a newer statement is PAID the older open ones are
    // settled too (instead of staying OVERDUE forever).
    const newestPaid = await prisma.creditStatement.findFirst({
      where: { creditDetailId: creditDetail.id, status: "PAID" },
      orderBy: { statementDate: "desc" },
      select: { statementDate: true },
    });
    if (newestPaid) {
      await prisma.creditStatement.updateMany({
        where: {
          creditDetailId: creditDetail.id,
          status: { in: OPEN_STATEMENT_STATUSES },
          statementDate: { lt: newestPaid.statementDate },
        },
        data: { status: "PAID" },
      });
    }
    const activePlans = await prisma.creditInstallmentPlan.findMany({
      where: { creditDetailId: creditDetail.id, status: "ACTIVE" },
      include: {
        installments: { include: { statement: { select: { status: true } } } },
      },
    });
    for (const plan of activePlans) {
      const isComplete = plan.installments.every(
        (i) => i.statement?.status === "PAID",
      );

      if (isComplete) {
        await prisma.creditInstallmentPlan.update({
          where: { id: plan.id },
          data: { status: "PAID_OFF" },
        });
      }
    }
  }
};

// One installment as shown on a statement: which plan, and which payment of it.
const toInstallmentLine = (installment, plan) => ({
  planId: plan.id,
  description: plan.description,
  installmentNo: installment.installmentNo,
  termMonths: plan.termMonths,
  planStatus: plan.status ?? "ACTIVE",
  amount: Number(installment.amount),
  dueDate: installment.dueDate,
});

const toCreditItem = (
  statement,
  asset,
  amountPaid,
  installments = [],
  owedCap,
) => {
  const statementBalance = Number(statement.statementBalance);
  const feesCharged = statementFees(statement);
  const remaining = statementRemaining(statement, amountPaid, owedCap);

  return {
    installments,
    key: `credit-${statement.id}`,
    source: "CREDIT_STATEMENT",
    sourceId: statement.id,
    type: "Transfer",
    description: `${asset.name} bill`,
    amount: remaining,
    statementBalance,
    feesCharged,
    amountPaid,
    statementDate: statement.statementDate,
    dueDate: statement.dueDate,
    status: statement.status,
    category: null,
    fromAsset: null,
    toAsset: {
      id: asset.id,
      name: asset.name,
      category: asset.category,
      color: asset.color,
    },
    behaviour: "REMIND",
    projected: false,
    actionable: true,
    needsAttention: false,
    failureReason: null,
  };
};

// Principal of installment plans that hasn't reached a statement yet as of
// `closeDate`. The card's balance already holds the whole purchase, so this is
// subtracted to leave only what has been billed. PAID_OFF plans still count:
// when backfilling an older cycle they were unbilled then.
const getUnbilledPrincipal = async (creditDetailId, closeDate, timezone) => {
  const plans = await prisma.creditInstallmentPlan.findMany({
    where: { creditDetailId, status: { not: "CANCELLED" } },
    select: { totalAmount: true, termMonths: true, startDate: true },
  });

  return plans.reduce((sum, plan) => {
    const billed = billedInstallmentCount(
      plan.startDate,
      closeDate,
      plan.termMonths,
      timezone,
    );
    const unbilled =
      (Number(plan.totalAmount) * (plan.termMonths - billed)) / plan.termMonths;
    return sum + Math.round(unbilled * 100) / 100;
  }, 0);
};

// What the card owes today for charges that have already been billed: the
// balance less installment principal still to come. Zero or a credit when a
// purchase was archived or refunded.
const getBilledOwed = async (userId, assetId, creditDetailId, timezone) => {
  const asOf = moment().tz(timezone).endOf("day");
  const [asset, unbilled] = await Promise.all([
    getAssetRemainingBalance(userId, assetId),
    getUnbilledPrincipal(creditDetailId, asOf, timezone),
  ]);
  return Math.max(Number(asset?.remainingBalance ?? 0) - unbilled, 0);
};

// Installments the upcoming statement will include: plans whose billed count
// goes up between the last close and `nextClose` (one installment each).
const getUpcomingInstallments = async (
  creditDetail,
  lastClose,
  nextClose,
  timezone,
) => {
  const plans = await prisma.creditInstallmentPlan.findMany({
    where: { creditDetailId: creditDetail.id, status: "ACTIVE" },
  });

  return plans.flatMap((plan) => {
    const next = billedInstallmentCount(
      plan.startDate,
      nextClose,
      plan.termMonths,
      timezone,
    );
    const last = billedInstallmentCount(
      plan.startDate,
      lastClose,
      plan.termMonths,
      timezone,
    );
    if (next <= last) return [];

    return [
      {
        planId: plan.id,
        description: plan.description,
        installmentNo: next,
        termMonths: plan.termMonths,
        planStatus: plan.status,
        amount: Number(plan.monthlyAmount),
        dueDate: creditDueDate(nextClose, creditDetail).toDate(),
      },
    ];
  });
};

const getCreditItems = async (userId, timezone, from, to) => {
  const today = moment().tz(timezone).startOf("day");
  const tz = timezone || (await getTimezone(userId));

  const cards = await prisma.asset.findMany({
    where: {
      userId: Number(userId),
      isActive: true,
      category: "CREDIT",
      creditDetail: CREDIT_DETAIL_READY,
    },
    select: {
      ...assetSelect,
      creditDetail: {
        select: {
          id: true,
          statementDate: true,
          dueDate: true,
          dueDaysAfterStatement: true,
          // A newer statement already includes any unpaid older balance, so
          // only the latest open statement is billed to avoid double counting.
          statements: {
            where: { status: { in: OPEN_STATEMENT_STATUSES } },
            orderBy: { statementDate: "desc" },
            take: 1,
            include: {
              installments: {
                include: {
                  plan: { select: { id: true, description: true, termMonths: true, status: true } },
                },
                orderBy: [{ planId: "asc" }, { installmentNo: "asc" }],
              },
            },
          },
        },
      },
    },
  });

  const items = [];

  for (const card of cards) {
    const { creditDetail } = card;
    const statement = creditDetail.statements[0];

    if (statement) {
      const payments = await getStatementPayments(statement, card.id, timezone);
      const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      items.push(
        toCreditItem(
          statement,
          card,
          amountPaid,
          statement.installments.map((i) => toInstallmentLine(i, i.plan)),
          await getBilledOwed(userId, card.id, creditDetail.id, tz),
        ),
      );
    }

    // Projection for the cycle that hasn't closed yet (estimate = current balance).
    if (to) {
      const nextClose = dayInMonth(
        lastStatementClose(today, creditDetail.statementDate)
          .add(1, "month")
          .startOf("month"),
        creditDetail.statementDate,
      );
      const nextDue = creditDueDate(nextClose, creditDetail);

      if (inRange(nextDue, from, to)) {
        const asset = await getAssetRemainingBalance(userId, card.id);
        const unbilled = await getUnbilledPrincipal(
          creditDetail.id,
          nextClose,
          tz,
        );
        const estimate = Math.max(
          Number(asset?.remainingBalance ?? 0) - unbilled,
          0,
        );

        if (estimate > 0) {
          const installments = await getUpcomingInstallments(
            creditDetail,
            lastStatementClose(today, creditDetail.statementDate),
            nextClose,
            tz,
          );

          items.push({
            installments,
            key: `credit-${card.id}-${nextDue.format("YYYYMMDD")}`,
            source: "CREDIT_STATEMENT",
            sourceId: null,
            type: "Transfer",
            description: `${card.name} bill`,
            amount: estimate,
            statementBalance: estimate,
            amountPaid: 0,
            statementDate: nextClose.toDate(),
            dueDate: nextDue.toDate(),
            status: "UPCOMING",
            category: null,
            fromAsset: null,
            toAsset: {
              id: card.id,
              name: card.name,
              category: card.category,
              color: card.color,
            },
            behaviour: "REMIND",
            projected: true,
            actionable: false,
            needsAttention: false,
            failureReason: null,
          });
        }
      }
    }
  }

  return items;
};

/*
|--------------------------------------------------------------------------
| Recurring
|--------------------------------------------------------------------------
*/
const getRecurringItems = async (userId, timezone, { from, to, type }) => {
  const recurringList = await prisma.recurringTransaction.findMany({
    where: {
      userId: Number(userId),
      status: "ACTIVE",
      isActive: true,
      ...(type && { type }),
      ...(to && { nextDueDate: { lte: new Date(to) } }),
    },
    include: {
      category: { select: categorySelect },
      fromAsset: { select: assetSelect },
      toAsset: { select: assetSelect },
      logs: {
        where: { result: "FAILED" },
        orderBy: { firedAt: "desc" },
        take: 1,
        select: { errorMessage: true, firedAt: true },
      },
    },
  });

  const items = [];

  for (const item of recurringList) {
    const nextDue = moment(item.nextDueDate).tz(timezone).startOf("day");
    const endDate = item.endDate
      ? moment(item.endDate).tz(timezone).endOf("day")
      : null;

    // A FAILED log only matters for the cycle that is currently due.
    const failedLog = item.logs[0];
    const needsAttention =
      item.behaviour === "AUTO_LOG" &&
      !!failedLog &&
      moment(failedLog.firedAt).tz(timezone).isSame(nextDue, "day");

    const account = getRecurringAccount(item);
    const base = {
      source: "RECURRING",
      sourceId: item.id,
      type: item.type,
      description: item.description,
      amount: Number(item.amount),
      behaviour: item.behaviour,
      interval: item.interval,
      unit: item.unit,
      category: item.category,
      fromAsset: item.type === "Income" ? null : item.fromAsset,
      toAsset: item.type === "Income" ? account : item.toAsset,
      status: null,
    };

    // The current cycle is always returned when it's in range (or overdue
    // and no lower bound was given), even if it's before `from`.
    const pushCycle = (dueDate, isCurrent) => {
      items.push({
        ...base,
        key: `recurring-${item.id}-${dueDate.format("YYYYMMDD")}`,
        dueDate: dueDate.toDate(),
        projected: !isCurrent,
        actionable:
          isCurrent && (item.behaviour === "REMIND" || needsAttention),
        needsAttention: isCurrent && needsAttention,
        failureReason:
          isCurrent && needsAttention
            ? (failedLog.errorMessage ?? "Auto-log failed")
            : null,
      });
    };

    if (inRange(nextDue, from, to)) pushCycle(nextDue, true);

    // Projections only make sense for a bounded range (calendar views).
    if (!to) continue;

    let k = 0;
    let next = occurrence(item, k, timezone);
    while (!next.isAfter(nextDue)) next = occurrence(item, ++k, timezone);

    let count = 0;
    while (
      !next.isAfter(to) &&
      (!endDate || !next.isAfter(endDate)) &&
      count < MAX_OCCURRENCES_PER_ITEM
    ) {
      if (inRange(next, from, to)) pushCycle(next, false);
      next = occurrence(item, ++k, timezone);
      count++;
    }
  }

  return items;
};

/*
|--------------------------------------------------------------------------
| List
|--------------------------------------------------------------------------
| Query:
|   dateFrom / dateTo  ISO dates. Without dateFrom, overdue items are included.
|   type               Expense | Income | Transfer
|   source             RECURRING | CREDIT_STATEMENT
|   actionable         "true" -> only items that need the user (pay/skip)
*/
export const getSchedules = async (userId, query = {}) => {
  const timezone = await getTimezone(userId);
  const today = moment().tz(timezone).startOf("day");

  const from = query.dateFrom ? moment(query.dateFrom) : null;
  const to = query.dateTo ? moment(query.dateTo) : null;
  const { type, source } = query;
  const actionableOnly =
    query.actionable === "true" || query.actionable === true;

  const wantsRecurring = !source || source === "RECURRING";
  const wantsCredit =
    (!source || source === "CREDIT_STATEMENT") &&
    (!type || type === "Transfer");

  if (wantsCredit) await syncCreditStatements(userId, timezone);

  const [recurring, credit] = await Promise.all([
    wantsRecurring
      ? getRecurringItems(userId, timezone, { from, to, type })
      : [],
    wantsCredit ? getCreditItems(userId, timezone, from, to) : [],
  ]);

  return [
    ...recurring,
    ...credit.filter(
      (item) => item.projected || inRange(item.dueDate, from, to),
    ),
  ]
    .filter((item) => !actionableOnly || item.actionable)
    .sort((a, b) => {
      const rankDiff = priorityRank(a, today) - priorityRank(b, today);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
};

/*
|--------------------------------------------------------------------------
| Recurring: detail / history / pay / skip
|--------------------------------------------------------------------------
*/
const findRecurring = async (userId, id) => {
  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id: Number(id), userId: Number(userId), isActive: true },
    include: {
      category: { select: categorySelect },
      fromAsset: { select: assetSelect },
      toAsset: { select: assetSelect },
    },
  });

  if (!recurring) throw new AppError("Scheduled transaction not found", 404);
  return recurring;
};

export const getRecurringSchedule = async (userId, id) => {
  const recurring = await findRecurring(userId, id);
  const account = getRecurringAccount(recurring);
  const balance = await getAssetRemainingBalance(userId, account?.id);

  return {
    id: recurring.id,
    source: "RECURRING",
    type: recurring.type,
    description: recurring.description,
    amount: Number(recurring.amount),
    dueDate: recurring.nextDueDate,
    nextDueDate: recurring.nextDueDate,
    startDate: recurring.startDate,
    endDate: recurring.endDate,
    interval: recurring.interval,
    unit: recurring.unit,
    behaviour: recurring.behaviour,
    category: recurring.category,
    // `account` is the one money moves out of (Expense/Transfer) or into (Income).
    account: account && {
      ...account,
      remainingBalance: balance?.remainingBalance ?? null,
    },
    fromAsset: recurring.type === "Income" ? null : recurring.fromAsset,
    toAsset: recurring.type === "Income" ? account : recurring.toAsset,
  };
};

export const getRecurringScheduleHistory = async (userId, id) => {
  const recurring = await findRecurring(userId, id);
  const where = {
    recurringId: recurring.id,
    status: { in: ["Completed", "Skipped"] },
  };
  const select = { id: true, amount: true, date: true, status: true };

  const [expenses, incomes, transfers, skippedLogs] = await Promise.all([
    prisma.expense.findMany({
      where,
      select: { ...select, recurringDueDate: true },
    }),
    prisma.income.findMany({ where, select }),
    prisma.transfer.findMany({ where, select }),
    prisma.recurringLog.findMany({
      where: { recurringId: recurring.id, result: "SKIPPED" },
      select: { id: true, firedAt: true },
    }),
  ]);

  return [
    ...[...expenses, ...incomes, ...transfers].map((entry) => ({
      key: `tx-${entry.id}`,
      id: entry.id,
      amount: Number(entry.amount),
      date: entry.date,
      status: entry.status,
      dueDate: entry.recurringDueDate ?? null,
    })),
    ...skippedLogs.map((log) => ({
      key: `log-${log.id}`,
      id: log.id,
      amount: Number(recurring.amount),
      date: log.firedAt,
      status: "Skipped",
      dueDate: log.firedAt,
    })),
  ].sort(
    (a, b) => new Date(b.dueDate ?? b.date) - new Date(a.dueDate ?? a.date),
  );
};

export const payRecurringSchedule = async (userId, id, data) => {
  const recurring = await findRecurring(userId, id);
  const timezone = await getTimezone(userId);

  const amount = Number(data.amount);
  const date = new Date(data.date);
  const accountId = Number(data.account) || getRecurringAccount(recurring)?.id;
  const categoryId = Number(data.category) || recurring.categoryId;

  if (!accountId) throw new AppError("Account is required", 400);
  await validateCategory(categoryId);

  // Money leaves the account for Expense/Transfer, so check it can cover it.
  if (recurring.type !== "Income" && date <= new Date()) {
    await assertCanSpend(userId, accountId, amount);
  }

  if (recurring.type === "Transfer" && !recurring.toAssetId) {
    throw new AppError(
      "This scheduled transfer has no destination account",
      400,
    );
  }

  const common = {
    amount,
    date,
    description: data.description || recurring.description,
    status: date > new Date() ? "Pending" : "Completed",
    userId: Number(userId),
    categoryId,
    recurringId: recurring.id,
  };

  const created = await prisma.$transaction(async (tx) => {
    let entry;
    if (recurring.type === "Expense") {
      entry = await tx.expense.create({
        data: {
          ...common,
          assetId: accountId,
          recurringDueDate: recurring.nextDueDate,
        },
      });
    } else if (recurring.type === "Income") {
      entry = await tx.income.create({
        data: { ...common, assetId: accountId },
      });
    } else {
      entry = await tx.transfer.create({
        data: {
          ...common,
          fromAssetId: accountId,
          toAssetId: recurring.toAssetId,
        },
      });
    }

    await tx.recurringLog.upsert({
      where: {
        recurringId_firedAt: {
          recurringId: recurring.id,
          firedAt: moment(recurring.nextDueDate)
            .tz(timezone)
            .startOf("day")
            .toDate(),
        },
      },
      create: {
        recurringId: recurring.id,
        firedAt: moment(recurring.nextDueDate)
          .tz(timezone)
          .startOf("day")
          .toDate(),
        result: "CREATED",
        [`generated${recurring.type}Id`]: entry.id,
      },
      update: {
        result: "CREATED",
        errorMessage: null,
        [`generated${recurring.type}Id`]: entry.id,
      },
    });

    await transactBill(recurring.id, userId, tx);
    return entry;
  });

  return created;
};

export const skipRecurringSchedule = async (userId, id) => {
  const recurring = await findRecurring(userId, id);
  const timezone = await getTimezone(userId);
  const firedAt = moment(recurring.nextDueDate)
    .tz(timezone)
    .startOf("day")
    .toDate();

  return prisma.$transaction(async (tx) => {
    const log = await tx.recurringLog.upsert({
      where: { recurringId_firedAt: { recurringId: recurring.id, firedAt } },
      create: { recurringId: recurring.id, firedAt, result: "SKIPPED" },
      update: { result: "SKIPPED", errorMessage: null },
    });

    await transactBill(recurring.id, userId, tx);
    return log;
  });
};

/*
|--------------------------------------------------------------------------
| Credit statement: detail / pay
|--------------------------------------------------------------------------
*/
const findStatement = async (userId, id) => {
  const statement = await prisma.creditStatement.findFirst({
    where: {
      id: Number(id),
      creditDetail: { asset: { userId: Number(userId) } },
    },
    include: {
      creditDetail: { include: { asset: { select: assetSelect } } },
    },
  });

  if (!statement) throw new AppError("Credit statement not found", 404);
  return statement;
};

export const getCreditStatementSchedule = async (userId, id) => {
  const timezone = await getTimezone(userId);
  const statement = await findStatement(userId, id);
  const card = statement.creditDetail.asset;

  const [payments, balance, installments] = await Promise.all([
    getStatementPayments(statement, card.id, timezone),
    getAssetRemainingBalance(userId, card.id),
    // Installments billed on this statement, for its line items.
    prisma.creditInstallment.findMany({
      where: { statementId: statement.id },
      orderBy: [{ planId: "asc" }, { installmentNo: "asc" }],
      include: {
        plan: { select: { id: true, description: true, termMonths: true, status: true } },
      },
    }),
  ]);
  const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const owedCap = await getBilledOwed(
    userId,
    card.id,
    statement.creditDetailId,
    timezone,
  );

  return {
    ...toCreditItem(statement, card, amountPaid, [], owedCap),
    id: statement.id,
    currentBalance: balance?.remainingBalance ?? null,
    creditLimit: Number(statement.creditDetail.creditLimit),
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    // Copied from the bank statement when the bill was paid; 0 until then.
    interestCharged: Number(statement.interestCharged),
    lateFeeCharged: Number(statement.lateFeeCharged),
    otherFees: Number(statement.otherFees),
    installments: installments.map((i) => toInstallmentLine(i, i.plan)),
  };
};

/**
 * Breakdown of the projected (not yet closed) statement of a card: every
 * completed transaction on the card since the last statement closed, plus what
 * was carried over from before. `id` is the card's asset id (projected items
 * have no statement id).
 */
export const getProjectedCreditStatement = async (userId, id) => {
  const timezone = await getTimezone(userId);
  const today = moment().tz(timezone).startOf("day");

  const card = await prisma.asset.findFirst({
    where: {
      id: Number(id),
      userId: Number(userId),
      isActive: true,
      category: "CREDIT",
      creditDetail: CREDIT_DETAIL_READY,
    },
    select: { ...assetSelect, creditDetail: true },
  });
  if (!card) throw new AppError("Credit card not found", 404);

  const { creditDetail } = card;
  const lastClose = lastStatementClose(today, creditDetail.statementDate);
  const nextClose = dayInMonth(
    lastClose.clone().add(1, "month").startOf("month"),
    creditDetail.statementDate,
  );
  const nextDue = creditDueDate(nextClose, creditDetail);

  const dateFilter = { gt: lastClose.clone().endOf("day").toDate() };
  const base = { isActive: true, status: "Completed", date: dateFilter };
  const select = {
    id: true,
    amount: true,
    date: true,
    description: true,
    category: { select: categorySelect },
  };

  const [expenses, incomes, transfersOut, transfersIn] = await Promise.all([
    prisma.expense.findMany({
      where: { ...base, assetId: card.id },
      select,
    }),
    prisma.income.findMany({ where: { ...base, assetId: card.id }, select }),
    prisma.transfer.findMany({
      where: { ...base, fromAssetId: card.id },
      select: { ...select, toAsset: { select: assetSelect } },
    }),
    prisma.transfer.findMany({
      where: { ...base, toAssetId: card.id },
      select: { ...select, fromAsset: { select: assetSelect } },
    }),
  ]);

  // `effect` is how the entry moves the amount owed: charges and cash
  // advances raise it, payments and refunds lower it.
  const entry = (type, row, effect) => ({
    key: `${type.toLowerCase()}-${row.id}`,
    id: row.id,
    type,
    description: row.description,
    date: row.date,
    category: row.category ?? null,
    amount: Number(row.amount),
    effect: effect * Number(row.amount),
    counterAsset: row.toAsset ?? row.fromAsset ?? null,
  });

  const transactions = [
    ...expenses.map((r) => entry("Expense", r, 1)),
    ...incomes.map((r) => entry("Income", r, -1)),
    ...transfersOut.map((r) => entry("Transfer", r, 1)),
    ...transfersIn.map((r) => entry("Transfer", r, -1)),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const [asset, unbilled] = await Promise.all([
    getAssetRemainingBalance(userId, card.id),
    getUnbilledPrincipal(creditDetail.id, nextClose, timezone),
  ]);

  const cycleTotal = transactions.reduce((sum, t) => sum + t.effect, 0);
  const estimate = Math.max(Number(asset?.remainingBalance ?? 0) - unbilled, 0);

  return {
    card: { id: card.id, name: card.name, color: card.color },
    periodStart: lastClose.clone().add(1, "day").toDate(),
    statementDate: nextClose.toDate(),
    dueDate: nextDue.toDate(),
    estimate,
    cycleTotal,
    // Unpaid from earlier cycles that rolls into this statement.
    carriedOver: estimate - cycleTotal,
    unbilledInstallments: unbilled,
    transactions,
  };
};

const FEE_CATEGORY_NAME = "Fees & Charges";

// Expense category the card's interest and fees are recorded under; created
// on first use so users don't have to set it up.
const resolveFeeCategory = async (tx, userId) => {
  const existing = await tx.categories.findFirst({
    where: {
      isActive: true,
      name: { equals: FEE_CATEGORY_NAME, mode: "insensitive" },
      type: { equals: "Expense", mode: "insensitive" },
      OR: [{ userId: null }, { userId: Number(userId) }],
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.categories.create({
    data: { name: FEE_CATEGORY_NAME, type: "Expense", userId: Number(userId) },
    select: { id: true },
  });
  return created.id;
};

export const payCreditStatement = async (userId, id, data) => {
  const statement = await findStatement(userId, id);
  const card = statement.creditDetail.asset;

  const amount = Number(data.amount);
  const date = new Date(data.date);
  const fromAssetId = Number(data.account);

  const interest = Number(data.interestCharged) || 0;
  const lateFee = Number(data.lateFeeCharged) || 0;
  const otherFees = Number(data.otherFees) || 0;
  const totalFees = interest + lateFee + otherFees;

  // Fees already recorded on this statement (an earlier partial payment), so
  // entering them again doesn't charge the card twice. Only an increase is new.
  const recordedFees = statementFees(statement);
  const newFees = Math.max(totalFees - recordedFees, 0);

  if (fromAssetId === card.id)
    throw new AppError("Pay from a different account than the card", 400);

  const fromAsset = await validateAsset(fromAssetId, userId);
  if (!PAYMENT_SOURCE_CATEGORIES.includes(fromAsset.category)) {
    throw new AppError("Pay the bill from a cash or bank account", 400);
  }

  // The new fees are recorded as a card expense in the transaction below, so
  // they count as owed even though that expense doesn't exist yet.
  if (date <= new Date()) {
    await assertCanSpend(userId, fromAssetId, amount);
    await assertCanReceive(userId, card.id, amount, { restore: newFees });
  }

  const categoryId = await resolveTransferCategory(userId, data.category);
  const isFuture = date > new Date();

  const transfer = await prisma.$transaction(async (tx) => {
    if (totalFees > recordedFees) {
      await tx.creditStatement.update({
        where: { id: statement.id },
        data: { interestCharged: interest, lateFeeCharged: lateFee, otherFees },
      });
    }

    if (newFees > 0) {
      const parts = [
        interest && `interest ${interest.toFixed(2)}`,
        lateFee && `late fee ${lateFee.toFixed(2)}`,
        otherFees && `other fees ${otherFees.toFixed(2)}`,
      ].filter(Boolean);

      await tx.expense.create({
        data: {
          amount: newFees,
          description: `${card.name} statement: ${parts.join(", ")}`,
          status: isFuture ? "Pending" : "Completed",
          date,
          category: { connect: { id: await resolveFeeCategory(tx, userId) } },
          asset: { connect: { id: card.id } },
          user: { connect: { id: Number(userId) } },
        },
      });
    }

    return tx.transfer.create({
      data: {
        amount,
        date,
        description: data.description || `${card.name} bill payment`,
        status: isFuture ? "Pending" : "Completed",
        userId: Number(userId),
        categoryId,
        fromAssetId,
        toAssetId: card.id,
        creditStatementId: statement.id,
      },
    });
  });

  await syncCreditStatements(userId);
  return transfer;
};

// Data for a transfer that gives back what was paid on a plan's billed
// installments, from the card to the account that last paid it. Null when
// there is nothing to give back. The caller creates it inside its own
// transaction so the refund and the cancel commit together.
//
// Payments are treated as covering a statement's other charges first, so only
// the billed installments the user actually paid for come back:
//   refund = billed installments − what the card still owes on its bills
// Unpaid installments are simply dropped by the cancel, not refunded.
export const buildBilledInstallmentRefund = async (userId, planId) => {
  const plan = await prisma.creditInstallmentPlan.findUnique({
    where: { id: planId },
    select: { creditDetail: { select: { id: true, assetId: true } } },
  });
  const { id: creditDetailId, assetId: cardId } = plan.creditDetail;

  const billed = await prisma.creditInstallment.aggregate({
    where: { statementId: { not: null }, planId },
    _sum: { amount: true },
  });

  const billedAmount = Number(billed._sum.amount ?? 0);
  if (billedAmount <= 0) return null;

  // What the card owes on its bills right now. The newest statement's balance
  // already carries anything unpaid from older ones, so it alone is the total.
  // Purchases made after it closed aren't due yet and don't reduce the refund.
  const latestStatement = await prisma.creditStatement.findFirst({
    where: { creditDetailId },
    orderBy: { statementDate: "desc" },
  });

  const tz = await getTimezone(userId);
  let owed = 0;
  if (latestStatement) {
    const [payments, owedCap] = await Promise.all([
      getStatementPayments(latestStatement, cardId, tz),
      getBilledOwed(userId, cardId, creditDetailId, tz),
    ]);
    const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    owed = statementRemaining(latestStatement, amountPaid, owedCap);
  }

  const amount = Math.round(Math.min(Math.max(billedAmount - owed, 0), billedAmount) * 100) / 100;
  if (amount <= 0) return null;

  // Counts payments made from the plain transfer form too, not just ones
  // linked to a statement.
  const lastPayment = await prisma.transfer.findFirst({
    where: {
      toAssetId: cardId,
      isActive: true,
      status: "Completed",
    },
    orderBy: { date: "desc" },
  });
  if (!lastPayment) return null;

  return {
    amount,
    date: new Date(),
    description: "Refund: cancelled installment purchase",
    status: "Completed",
    userId: Number(userId),
    categoryId: await resolveTransferCategory(userId),
    fromAssetId: cardId,
    toAssetId: lastPayment.fromAssetId, // the account that paid
  };
};

/*
|--------------------------------------------------------------------------
| Installment plans: cancel
|--------------------------------------------------------------------------
| Drops the installments not yet billed, marks the plan CANCELLED and archives
| its original purchase. Billed installments stay as history, and what was paid
| on them is given back with a refund transfer.
*/
export const cancelInstallmentPlan = async (userId, id) => {
  const planId = Number(id);

  const plan = await prisma.creditInstallmentPlan.findFirst({
    where: {
      id: planId,
      creditDetail: { asset: { userId: Number(userId) } },
    },
  });

  if (!plan) throw new AppError("Installment plan not found", 404);
  if (plan.status === "CANCELLED") {
    throw new AppError("This installment plan is already cancelled", 400);
  }

  const refund = await buildBilledInstallmentRefund(userId, planId);

  await prisma.$transaction([
    ...(refund ? [prisma.transfer.create({ data: refund })] : []),
    prisma.creditInstallment.deleteMany({
      where: { statementId: null, planId },
    }),
    prisma.creditInstallmentPlan.update({
      where: { id: planId },
      data: { status: "CANCELLED" },
    }),
    ...(plan.expenseId
      ? [
          prisma.expense.update({
            where: { id: plan.expenseId },
            data: { isActive: false },
          }),
        ]
      : []),
  ]);

  await syncCreditStatements(userId);
  return { id: planId, status: "CANCELLED" };
};
