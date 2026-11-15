import moment from "moment-timezone";

import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import {
  billedInstallmentCount,
  creditDueDate,
  lastStatementClose,
  nextStatementClose,
  projectedBillEstimate,
} from "../../utils/creditCycle.js";
import {
  assertCanReceive,
  assertCanSpend,
  validateAsset,
} from "../assets.service.js";
import {
  assetSelect,
  categorySelect,
  getAssetRemainingBalance,
  getTimezone,
  inRange,
  resolveTransferCategory,
} from "./shared.js";

/*
|--------------------------------------------------------------------------
| Source: CREDIT_STATEMENT
|--------------------------------------------------------------------------
| CreditStatement (credit card bill). Generated here from
| CreditDetail.statementDate / dueDate once a cycle closes; the upcoming
| cycle is shown as a projection.
*/
const OPEN_STATEMENT_STATUSES = ["PENDING", "PARTIAL", "OVERDUE"];

// A card can bill statements once it has a statement day and a due rule: a
// day of the month, or a number of days after the statement date.
const CREDIT_DETAIL_READY = {
  statementDate: { not: null },
  OR: [{ dueDate: { not: null } }, { dueDaysAfterStatement: { not: null } }],
};

// The user's credit cards that can bill statements.
const billableCardsWhere = (userId) => ({
  userId: Number(userId),
  isActive: true,
  category: "CREDIT",
  creditDetail: CREDIT_DETAIL_READY,
});

// Accounts a card bill can be paid from (not another card or a loan).
const PAYMENT_SOURCE_CATEGORIES = ["CASH", "BANK"];

// Expense category the card's interest and fees are recorded under.
const FEE_CATEGORY_NAME = "Fees & Charges";

// How many missed statement cycles to create at once for a card.
const MAX_STATEMENT_BACKFILL = 12;

const planLineSelect = {
  id: true,
  description: true,
  termMonths: true,
  status: true,
};

const pickAsset = (asset) => ({
  id: asset.id,
  name: asset.name,
  category: asset.category,
  color: asset.color,
});

// Sum of payments into the card after the statement closed. Counts every
// transfer to the card (not just ones linked via creditStatementId) so
// payments made from the regular transfer form also settle the bill.
export const getStatementPayments = async (statement, assetId, timezone) =>
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

export const totalPaid = (payments) =>
  payments.reduce((sum, p) => sum + Number(p.amount), 0);

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
export const statementRemaining = (
  statement,
  amountPaid,
  owedCap = Infinity,
) => {
  const balance = Number(statement.statementBalance) + statementFees(statement);
  return Math.max(Math.min(balance - amountPaid, owedCap), 0);
};

const statementStatus = (statement, amountPaid, today, owedCap) => {
  if (statementRemaining(statement, amountPaid, owedCap) <= 0) return "PAID";
  if (moment(statement.dueDate).isBefore(today, "day")) return "OVERDUE";
  if (amountPaid > 0) return "PARTIAL";
  return "PENDING";
};

// Every cycle that closed since the card existed (newest first), so a cycle
// missed while the app/cron was off is still billed. A card didn't exist yet
// for cycles that closed before it was opened.
const closedCyclesSinceOpened = (card, today, timezone) => {
  const { statementDate } = card.creditDetail;
  const openedOn = moment(card.openedAt ?? card.createdAt)
    .tz(timezone)
    .startOf("day");

  const closeDates = [];
  let close = lastStatementClose(today, statementDate);
  while (
    !close.isBefore(openedOn) &&
    closeDates.length < MAX_STATEMENT_BACKFILL
  ) {
    closeDates.push(close);
    close = lastStatementClose(close.clone().subtract(1, "day"), statementDate);
  }
  return closeDates;
};

// Bills every closed cycle that has no statement yet, with the balance the
// card had on its close date (less installment principal not billed yet).
const createMissingStatements = async (userId, card, today, timezone) => {
  const { creditDetail } = card;
  const closeDates = closedCyclesSinceOpened(card, today, timezone);

  const existing = await prisma.creditStatement.findMany({
    where: {
      creditDetailId: creditDetail.id,
      statementDate: { in: closeDates.map((d) => d.toDate()) },
    },
    select: { statementDate: true },
  });
  const existingTimes = new Set(existing.map((e) => e.statementDate.getTime()));
  const missing = closeDates.filter(
    (d) => !existingTimes.has(d.toDate().getTime()),
  );

  for (const closeDate of missing) {
    const asset = await getAssetRemainingBalance(userId, card.id, {
      asOf: closeDate.clone().endOf("day").toDate(),
    });
    const unbilled = await getUnbilledPrincipal(
      creditDetail.id,
      closeDate,
      timezone,
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
};

// Links each installment not on a statement yet to the statement due in the
// same month, once that statement exists.
const attachInstallmentsToStatements = async (creditDetailId, timezone) => {
  const unattached = await prisma.creditInstallment.findMany({
    where: {
      statementId: null,
      plan: { creditDetailId, status: { not: "CANCELLED" } },
    },
  });

  for (const item of unattached) {
    const dueMonth = moment.tz(item.dueDate, timezone).startOf("month");

    const statement = await prisma.creditStatement.findFirst({
      where: {
        creditDetailId,
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
};

// Refresh status of open statements from actual payments.
const refreshOpenStatementStatuses = async (userId, card, today, timezone) => {
  const { creditDetail } = card;
  const openStatements = await prisma.creditStatement.findMany({
    where: {
      creditDetailId: creditDetail.id,
      status: { in: OPEN_STATEMENT_STATUSES },
    },
  });

  const owedCap = openStatements.length
    ? await getBilledOwed(userId, card.id, creditDetail.id, timezone)
    : Infinity;

  for (const statement of openStatements) {
    const payments = await getStatementPayments(statement, card.id, timezone);
    const status = statementStatus(
      statement,
      totalPaid(payments),
      today,
      owedCap,
    );

    if (status !== statement.status) {
      await prisma.creditStatement.update({
        where: { id: statement.id },
        data: { status },
      });
    }
  }
};

// A newer statement's balance already includes anything still unpaid from
// older ones, so once a newer statement is PAID the older open ones are
// settled too (instead of staying OVERDUE forever).
const settleOlderStatements = async (creditDetailId) => {
  const newestPaid = await prisma.creditStatement.findFirst({
    where: { creditDetailId, status: "PAID" },
    orderBy: { statementDate: "desc" },
    select: { statementDate: true },
  });
  if (!newestPaid) return;

  await prisma.creditStatement.updateMany({
    where: {
      creditDetailId,
      status: { in: OPEN_STATEMENT_STATUSES },
      statementDate: { lt: newestPaid.statementDate },
    },
    data: { status: "PAID" },
  });
};

// A plan is paid off once every one of its installments is on a PAID statement.
const markPaidOffPlans = async (creditDetailId) => {
  const activePlans = await prisma.creditInstallmentPlan.findMany({
    where: { creditDetailId, status: "ACTIVE" },
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
};

/**
 * Creates any missing statements for each credit card's closed cycles (up to
 * MAX_STATEMENT_BACKFILL) and refreshes the status of open statements and
 * installment plans. Idempotent, so it is safe to call on read and from the
 * cron.
 */
export const syncCreditStatements = async (userId, timezone) => {
  const tz = timezone || (await getTimezone(userId));
  const today = moment().tz(tz).startOf("day");

  const cards = await prisma.asset.findMany({
    where: billableCardsWhere(userId),
    select: {
      id: true,
      name: true,
      createdAt: true,
      openedAt: true,
      creditDetail: true,
    },
  });

  for (const card of cards) {
    const creditDetailId = card.creditDetail.id;

    await createMissingStatements(userId, card, today, tz);
    await attachInstallmentsToStatements(creditDetailId, tz);
    await refreshOpenStatementStatuses(userId, card, today, tz);
    await settleOlderStatements(creditDetailId);
    await markPaidOffPlans(creditDetailId);
  }
};

// Fields every card bill shares, open or projected.
const creditItemBase = (card) => ({
  source: "CREDIT_STATEMENT",
  type: "Transfer",
  description: `${card.name} bill`,
  category: null,
  fromAsset: null,
  toAsset: pickAsset(card),
  behaviour: "REMIND",
  needsAttention: false,
  failureReason: null,
});

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
    ...creditItemBase(asset),
    installments,
    key: `credit-${statement.id}`,
    sourceId: statement.id,
    amount: remaining,
    statementBalance,
    feesCharged,
    amountPaid,
    statementDate: statement.statementDate,
    dueDate: statement.dueDate,
    status: statement.status,
    projected: false,
    actionable: true,
  };
};

// The upcoming bill of a cycle that hasn't closed yet.
const toProjectedCreditItem = (
  card,
  estimate,
  closeDate,
  dueDate,
  installments,
) => ({
  ...creditItemBase(card),
  installments,
  key: `credit-${card.id}-${dueDate.format("YYYYMMDD")}`,
  sourceId: null,
  amount: estimate,
  statementBalance: estimate,
  amountPaid: 0,
  statementDate: closeDate.toDate(),
  dueDate: dueDate.toDate(),
  status: "UPCOMING",
  projected: true,
  actionable: false,
});

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
export const getBilledOwed = async (
  userId,
  assetId,
  creditDetailId,
  timezone,
) => {
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

    const installment = {
      installmentNo: next,
      amount: plan.monthlyAmount,
      dueDate: creditDueDate(nextClose, creditDetail).toDate(),
    };
    return [toInstallmentLine(installment, plan)];
  });
};

export const getCreditItems = async (userId, timezone, from, to) => {
  const tz = timezone || (await getTimezone(userId));
  const today = moment().tz(tz).startOf("day");

  const cards = await prisma.asset.findMany({
    where: billableCardsWhere(userId),
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
                include: { plan: { select: planLineSelect } },
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
    let openUnpaid = 0;

    if (statement) {
      const payments = await getStatementPayments(statement, card.id, tz);
      const openItem = toCreditItem(
        statement,
        card,
        totalPaid(payments),
        statement.installments.map((i) => toInstallmentLine(i, i.plan)),
        await getBilledOwed(userId, card.id, creditDetail.id, tz),
      );
      openUnpaid = openItem.amount;
      items.push(openItem);
    }

    // Projection for the cycle that hasn't closed yet (estimate = current balance).
    if (to) {
      const lastClose = lastStatementClose(today, creditDetail.statementDate);
      const nextClose = nextStatementClose(
        lastClose,
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
        const estimate = projectedBillEstimate({
          balance: asset?.remainingBalance,
          unbilled,
          openUnpaid,
        });

        if (estimate > 0) {
          const installments = await getUpcomingInstallments(
            creditDetail,
            lastClose,
            nextClose,
            tz,
          );

          items.push(
            toProjectedCreditItem(
              card,
              estimate,
              nextClose,
              nextDue,
              installments,
            ),
          );
        }
      }
    }
  }

  return items;
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
      include: { plan: { select: planLineSelect } },
    }),
  ]);
  const amountPaid = totalPaid(payments);
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
    where: { ...billableCardsWhere(userId), id: Number(id) },
    select: { ...assetSelect, creditDetail: true },
  });
  if (!card) throw new AppError("Credit card not found", 404);

  const { creditDetail } = card;
  const lastClose = lastStatementClose(today, creditDetail.statementDate);
  const nextClose = nextStatementClose(lastClose, creditDetail.statementDate);
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

// Created on first use so users don't have to set it up.
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
