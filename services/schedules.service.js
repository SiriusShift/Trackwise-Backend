import moment from "moment-timezone";

import { AppError } from "../utils/AppError.js";
import { getAssetBalance } from "./assets.service.js";
import { validateCategory } from "./categories.service.js";
import { transactBill } from "./recurring.service.js";

import { prisma } from "../config/prisma.js";

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
  moment.tz(item.startDate, timezone).startOf("day").add(k * item.interval, item.unit);

// Day-of-month clamped to the month length (31 -> Feb 28/29).
const dayInMonth = (monthMoment, day) =>
  monthMoment.clone().date(Math.min(day, monthMoment.daysInMonth())).startOf("day");

// Due date for a cycle closing on `closeDate`: same month when the due day
// comes after the statement day, otherwise the following month.
const creditDueDate = (closeDate, dueDay, statementDay) => {
  const month = dueDay > statementDay ? closeDate.clone() : closeDate.clone().add(1, "month");
  return dayInMonth(month.startOf("month"), dueDay);
};

// Most recent statement close on or before `today`.
const lastStatementClose = (today, statementDay) => {
  const thisMonth = dayInMonth(today.clone().startOf("month"), statementDay);
  return thisMonth.isAfter(today)
    ? dayInMonth(today.clone().subtract(1, "month").startOf("month"), statementDay)
    : thisMonth;
};

const inRange = (date, from, to) =>
  (!from || !moment(date).isBefore(from)) && (!to || !moment(date).isAfter(to));

const priorityRank = (item, today) => {
  if (item.needsAttention) return 0; // failed auto-log
  if (moment(item.dueDate).isBefore(today, "day")) return 1; // overdue
  return 2; // due today / upcoming
};

const resolveTransferCategory = async (userId, categoryId) => {
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

  if (!category) throw new AppError("No transfer category available for this payment", 400);
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
      date: { gt: moment(statement.statementDate).tz(timezone).endOf("day").toDate() },
    },
    select: { id: true, amount: true, date: true, description: true, fromAsset: { select: assetSelect } },
    orderBy: { date: "desc" },
  });

const statementStatus = (statement, amountPaid, today) => {
  const balance = Number(statement.statementBalance);
  if (amountPaid >= balance) return "PAID";
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
      creditDetail: { statementDate: { not: null }, dueDate: { not: null } },
    },
    select: { id: true, name: true, createdAt: true, openedAt: true, creditDetail: true },
  });

  for (const card of cards) {
    const { creditDetail } = card;
    const closeDate = lastStatementClose(today, creditDetail.statementDate);
    const openedOn = moment(card.openedAt ?? card.createdAt).tz(tz).startOf("day");

    // Card didn't exist yet when this cycle closed.
    if (!closeDate.isBefore(openedOn)) {
      const exists = await prisma.creditStatement.findUnique({
        where: {
          creditDetailId_statementDate: {
            creditDetailId: creditDetail.id,
            statementDate: closeDate.toDate(),
          },
        },
        select: { id: true },
      });

      if (!exists) {
        const asset = await getAssetRemainingBalance(userId, card.id, {
          asOf: closeDate.clone().endOf("day").toDate(),
        });
        const statementBalance = Math.max(Number(asset?.remainingBalance ?? 0), 0);

        await prisma.creditStatement.createMany({
          data: [
            {
              creditDetailId: creditDetail.id,
              statementDate: closeDate.toDate(),
              dueDate: creditDueDate(closeDate, creditDetail.dueDate, creditDetail.statementDate).toDate(),
              statementBalance,
              // NOTE: no minimum-payment config exists on CreditDetail, so the
              // full balance is used until one is added.
              minimumPaymentDue: statementBalance,
              status: statementBalance > 0 ? "PENDING" : "PAID",
            },
          ],
          skipDuplicates: true, // concurrent request/cron already created it
        });
      }
    }

    // Refresh status of open statements from actual payments.
    const openStatements = await prisma.creditStatement.findMany({
      where: { creditDetailId: creditDetail.id, status: { in: OPEN_STATEMENT_STATUSES } },
    });

    for (const statement of openStatements) {
      const payments = await getStatementPayments(statement, card.id, tz);
      const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const status = statementStatus(statement, amountPaid, today);

      if (status !== statement.status) {
        await prisma.creditStatement.update({ where: { id: statement.id }, data: { status } });
      }
    }
  }
};

const toCreditItem = (statement, asset, amountPaid) => {
  const statementBalance = Number(statement.statementBalance);
  const remaining = Math.max(statementBalance - amountPaid, 0);

  return {
    key: `credit-${statement.id}`,
    source: "CREDIT_STATEMENT",
    sourceId: statement.id,
    type: "Transfer",
    description: `${asset.name} bill`,
    amount: remaining,
    statementBalance,
    minimumPaymentDue: Number(statement.minimumPaymentDue),
    amountPaid,
    statementDate: statement.statementDate,
    dueDate: statement.dueDate,
    status: statement.status,
    category: null,
    fromAsset: null,
    toAsset: { id: asset.id, name: asset.name, category: asset.category, color: asset.color },
    behaviour: "REMIND",
    projected: false,
    actionable: true,
    needsAttention: false,
    failureReason: null,
  };
};

const getCreditItems = async (userId, timezone, from, to) => {
  const today = moment().tz(timezone).startOf("day");

  const cards = await prisma.asset.findMany({
    where: {
      userId: Number(userId),
      isActive: true,
      category: "CREDIT",
      creditDetail: { statementDate: { not: null }, dueDate: { not: null } },
    },
    select: {
      ...assetSelect,
      creditDetail: {
        select: {
          id: true,
          statementDate: true,
          dueDate: true,
          // A newer statement already includes any unpaid older balance, so
          // only the latest open statement is billed to avoid double counting.
          statements: {
            where: { status: { in: OPEN_STATEMENT_STATUSES } },
            orderBy: { statementDate: "desc" },
            take: 1,
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
      items.push(toCreditItem(statement, card, amountPaid));
    }

    // Projection for the cycle that hasn't closed yet (estimate = current balance).
    if (to) {
      const nextClose = dayInMonth(
        lastStatementClose(today, creditDetail.statementDate).add(1, "month").startOf("month"),
        creditDetail.statementDate,
      );
      const nextDue = creditDueDate(nextClose, creditDetail.dueDate, creditDetail.statementDate);

      if (inRange(nextDue, from, to)) {
        const asset = await getAssetRemainingBalance(userId, card.id);
        const estimate = Math.max(Number(asset?.remainingBalance ?? 0), 0);

        if (estimate > 0) {
          items.push({
            key: `credit-${card.id}-${nextDue.format("YYYYMMDD")}`,
            source: "CREDIT_STATEMENT",
            sourceId: null,
            type: "Transfer",
            description: `${card.name} bill`,
            amount: estimate,
            statementBalance: estimate,
            minimumPaymentDue: estimate,
            amountPaid: 0,
            statementDate: nextClose.toDate(),
            dueDate: nextDue.toDate(),
            status: "UPCOMING",
            category: null,
            fromAsset: null,
            toAsset: { id: card.id, name: card.name, category: card.category, color: card.color },
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
    const endDate = item.endDate ? moment(item.endDate).tz(timezone).endOf("day") : null;

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
        actionable: isCurrent && (item.behaviour === "REMIND" || needsAttention),
        needsAttention: isCurrent && needsAttention,
        failureReason: isCurrent && needsAttention ? failedLog.errorMessage ?? "Auto-log failed" : null,
      });
    };

    if (inRange(nextDue, from, to)) pushCycle(nextDue, true);

    // Projections only make sense for a bounded range (calendar views).
    if (!to) continue;

    let k = 0;
    let next = occurrence(item, k, timezone);
    while (!next.isAfter(nextDue)) next = occurrence(item, ++k, timezone);

    let count = 0;
    while (!next.isAfter(to) && (!endDate || !next.isAfter(endDate)) && count < MAX_OCCURRENCES_PER_ITEM) {
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
  const actionableOnly = query.actionable === "true" || query.actionable === true;

  const wantsRecurring = !source || source === "RECURRING";
  const wantsCredit = (!source || source === "CREDIT_STATEMENT") && (!type || type === "Transfer");

  if (wantsCredit) await syncCreditStatements(userId, timezone);

  const [recurring, credit] = await Promise.all([
    wantsRecurring ? getRecurringItems(userId, timezone, { from, to, type }) : [],
    wantsCredit ? getCreditItems(userId, timezone, from, to) : [],
  ]);

  return [...recurring, ...credit.filter((item) => item.projected || inRange(item.dueDate, from, to))]
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
    account: account && { ...account, remainingBalance: balance?.remainingBalance ?? null },
    fromAsset: recurring.type === "Income" ? null : recurring.fromAsset,
    toAsset: recurring.type === "Income" ? account : recurring.toAsset,
  };
};

export const getRecurringScheduleHistory = async (userId, id) => {
  const recurring = await findRecurring(userId, id);
  const where = { recurringId: recurring.id, status: { in: ["Completed", "Skipped"] } };
  const select = { id: true, amount: true, date: true, status: true };

  const [expenses, incomes, transfers, skippedLogs] = await Promise.all([
    prisma.expense.findMany({ where, select: { ...select, recurringDueDate: true } }),
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
  ].sort((a, b) => new Date(b.dueDate ?? b.date) - new Date(a.dueDate ?? a.date));
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
    const asset = await getAssetRemainingBalance(userId, accountId);
    if (!asset) throw new AppError("Account not found", 404);
    if (asset.category !== "CREDIT" && Number(asset.remainingBalance) < amount) {
      throw new AppError("Insufficient balance", 400);
    }
  }

  if (recurring.type === "Transfer" && !recurring.toAssetId) {
    throw new AppError("This scheduled transfer has no destination account", 400);
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
        data: { ...common, assetId: accountId, recurringDueDate: recurring.nextDueDate },
      });
    } else if (recurring.type === "Income") {
      entry = await tx.income.create({ data: { ...common, assetId: accountId } });
    } else {
      entry = await tx.transfer.create({
        data: { ...common, fromAssetId: accountId, toAssetId: recurring.toAssetId },
      });
    }

    await tx.recurringLog.upsert({
      where: {
        recurringId_firedAt: {
          recurringId: recurring.id,
          firedAt: moment(recurring.nextDueDate).tz(timezone).startOf("day").toDate(),
        },
      },
      create: {
        recurringId: recurring.id,
        firedAt: moment(recurring.nextDueDate).tz(timezone).startOf("day").toDate(),
        result: "CREATED",
        [`generated${recurring.type}Id`]: entry.id,
      },
      update: { result: "CREATED", errorMessage: null, [`generated${recurring.type}Id`]: entry.id },
    });

    await transactBill(recurring.id, userId, tx);
    return entry;
  });

  return created;
};

export const skipRecurringSchedule = async (userId, id) => {
  const recurring = await findRecurring(userId, id);
  const timezone = await getTimezone(userId);
  const firedAt = moment(recurring.nextDueDate).tz(timezone).startOf("day").toDate();

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
    where: { id: Number(id), creditDetail: { asset: { userId: Number(userId) } } },
    include: {
      creditDetail: { include: { asset: { select: assetSelect } } },
      creditStatementFees: { select: { id: true, label: true, amount: true } },
    },
  });

  if (!statement) throw new AppError("Credit statement not found", 404);
  return statement;
};

export const getCreditStatementSchedule = async (userId, id) => {
  const timezone = await getTimezone(userId);
  const statement = await findStatement(userId, id);
  const card = statement.creditDetail.asset;

  const [payments, balance] = await Promise.all([
    getStatementPayments(statement, card.id, timezone),
    getAssetRemainingBalance(userId, card.id),
  ]);
  const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    ...toCreditItem(statement, card, amountPaid),
    id: statement.id,
    currentBalance: balance?.remainingBalance ?? null,
    creditLimit: Number(statement.creditDetail.creditLimit),
    interestCharged: Number(statement.interestCharged),
    lateFeeCharged: Number(statement.lateFeeCharged),
    fees: statement.creditStatementFees.map((fee) => ({ ...fee, amount: Number(fee.amount) })),
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
  };
};

export const payCreditStatement = async (userId, id, data) => {
  const statement = await findStatement(userId, id);
  const card = statement.creditDetail.asset;

  const amount = Number(data.amount);
  const date = new Date(data.date);
  const fromAssetId = Number(data.account);

  if (fromAssetId === card.id) throw new AppError("Pay from a different account than the card", 400);

  const fromAsset = await getAssetRemainingBalance(userId, fromAssetId);
  if (!fromAsset) throw new AppError("Account not found", 404);
  if (date <= new Date() && Number(fromAsset.remainingBalance) < amount) {
    throw new AppError("Insufficient balance", 400);
  }

  const categoryId = await resolveTransferCategory(userId, data.category);

  const transfer = await prisma.transfer.create({
    data: {
      amount,
      date,
      description: data.description || `${card.name} bill payment`,
      status: date > new Date() ? "Pending" : "Completed",
      userId: Number(userId),
      categoryId,
      fromAssetId,
      toAssetId: card.id,
      creditStatementId: statement.id,
    },
  });

  await syncCreditStatements(userId);
  return transfer;
};
