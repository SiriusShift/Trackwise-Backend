import { AppError } from "../utils/AppError.js";

import moment from "moment-timezone";
import { prisma } from "../config/prisma.js";
import { postedExpenseWhere } from "../utils/postedExpenses.js";
import { firstOccurrenceOnOrAfter } from "../utils/recurringSchedule.js";
import { getUserTimezone } from "../utils/userTimezone.js";
import { getExchangeRates } from "./exchangeRate.service.js";
/*
|--------------------------------------------------------------------------
| Validate Asset
|--------------------------------------------------------------------------
*/
export const validateAsset = async (assetId, userId) => {
  const asset = await prisma.asset.findFirst({
    where: {
      id: Number(assetId),
      userId: Number(userId),
    },
  });

  if (!asset) {
    throw new AppError("Asset not found", 404);
  }

  return asset;
};

/*
|--------------------------------------------------------------------------
| Archived Accounts Are Read-Only
|--------------------------------------------------------------------------
| An archived account keeps its history, but its balance is frozen: nothing
| can add, change or remove money on it until it's unarchived. Descriptive
| edits (category, description, receipt) on its transactions are still fine.
*/
export const archivedAccountError = (asset) =>
  new AppError(
    `${asset.name} is archived. Unarchive it to add or change its transactions.`,
    400,
  );

// Whether an edit moves money: a different amount, date or account. Only
// those are blocked on archived accounts.
export const editMovesMoney = (before, after) =>
  Number(before.amount) !== Number(after.amount) ||
  new Date(before.date).getTime() !== new Date(after.date).getTime() ||
  ["assetId", "fromAssetId", "toAssetId"].some(
    (key) => key in after && (Number(before[key]) || 0) !== (Number(after[key]) || 0),
  );

// Also checks the accounts belong to the user. Empty ids are ignored.
export const assertAccountsActive = async (userId, assetIds) => {
  const ids = [...new Set(assetIds.map(Number).filter(Boolean))];
  if (!ids.length) return;

  const assets = await prisma.asset.findMany({
    where: { userId: Number(userId), id: { in: ids } },
    select: { id: true, name: true, isActive: true },
  });

  if (assets.length !== ids.length) throw new AppError("Asset not found", 404);

  const archived = assets.find((a) => !a.isActive);
  if (archived) throw archivedAccountError(archived);
};

// getAssetBalance only covers active accounts, so a miss there is either an
// archived account or one that doesn't exist.
const accountUnavailableError = async (userId, assetId) => {
  const asset = await validateAsset(assetId, userId);
  return asset.isActive
    ? new AppError("Account not found", 404)
    : archivedAccountError(asset);
};

/*
|--------------------------------------------------------------------------
| Account Categories per Transaction
|--------------------------------------------------------------------------
| Which account categories each kind of transaction may use. LOAN is left out
| until loan balances and payments are implemented.
*/
export const ACCOUNT_RULES = {
  expense: { categories: ["CASH", "BANK", "CREDIT"], label: "Expenses" },
  income: { categories: ["CASH", "BANK", "CREDIT"], label: "Income" },
  transferFrom: { categories: ["CASH", "BANK", "CREDIT", "INVESTMENT"], label: "Transfers from" },
  transferTo: { categories: ["CASH", "BANK", "CREDIT", "INVESTMENT"], label: "Transfers to" },
};

// allowArchived: for edits that leave the account's money untouched.
export const assertAccountCategory = async (
  userId,
  assetId,
  rule,
  { allowArchived = false } = {},
) => {
  const asset = await validateAsset(assetId, userId);
  if (!asset.isActive && !allowArchived) throw archivedAccountError(asset);
  if (!rule.categories.includes(asset.category)) {
    throw new AppError(`${rule.label} a ${asset.category.toLowerCase()} account isn't supported`, 400);
  }
  return asset;
};

/*
|--------------------------------------------------------------------------
| Create Asset
|--------------------------------------------------------------------------
*/
// The due date is either a day of the month (dueDate) or a number of days
// after the statement date (dueDaysAfterStatement), never both.
const DUE_DAYS_AFTER_MAX = 60;

const assertDueRule = (creditDetail) => {
  const { dueDate, dueDaysAfterStatement } = creditDetail ?? {};
  if (dueDate && dueDaysAfterStatement) {
    throw new AppError("Use either a due day or days after the statement date, not both", 400);
  }
  if (dueDaysAfterStatement) {
    const days = Number(dueDaysAfterStatement);
    if (!Number.isInteger(days) || days < 1 || days > DUE_DAYS_AFTER_MAX) {
      throw new AppError(
        `dueDaysAfterStatement must be between 1 and ${DUE_DAYS_AFTER_MAX} days`,
        400,
      );
    }
  }
};

const dueRuleData = (creditDetail) => ({
  dueDate: creditDetail?.dueDate ? Number(creditDetail.dueDate) : null,
  dueDaysAfterStatement: creditDetail?.dueDaysAfterStatement
    ? Number(creditDetail.dueDaysAfterStatement)
    : null,
});

export const createAsset = async (
  name,
  balance,
  currency,
  type,
  subtype,
  color,
  userId,
  includeNetWorth,
  creditDetail,
  savingsGoal,
) => {
  if (type === "CREDIT") {
    if (!creditDetail?.creditLimit) {
      throw new AppError("creditLimit is required for CREDIT assets", 400);
    }
    assertDueRule(creditDetail);
    for (const [label, val] of [
      ["statementDate", creditDetail?.statementDate],
      ["dueDate", creditDetail?.dueDate],
    ]) {
      if (
        val !== undefined &&
        val !== null &&
        (Number(val) < 1 || Number(val) > 31)
      ) {
        throw new AppError(
          `${label} must be a day of month between 1 and 31`,
          400,
        );
      }
    }
  }

  const asset = await prisma.asset.create({
    data: {
      name,
      balance: parseFloat(balance),
      includeInNetWorth: includeNetWorth,

      category: type,
      currency,

      ...(subtype && { subtype }),

      ...(type === "CREDIT" && {
        creditDetail: {
          create: {
            creditLimit: parseFloat(creditDetail?.creditLimit),
            statementDate: creditDetail?.statementDate
              ? Number(creditDetail?.statementDate)
              : null,
            ...dueRuleData(creditDetail),
          },
        },
      }),
      // Created with the asset so both are saved or neither is
      ...((subtype === "SAVINGS" &&
        savingsGoal?.targetAmount != null) && {
        savingsGoals: {
          create: {
            name,
            targetAmount: parseFloat(savingsGoal.targetAmount),
            targetDate: new Date(savingsGoal.targetDate),
            user: { connect: { id: Number(userId) } },
          },
        },
      }),
      color,

      user: {
        connect: { id: Number(userId) },
      },
    },
    include: {
      creditDetail: true,
      savingsGoals: { where: { isActive: true } },
    },
  });

  return asset;
};

/*
|--------------------------------------------------------------------------
| Archive / Unarchive Asset
|--------------------------------------------------------------------------
| An archived account keeps its history but is read-only (see
| assertAccountsActive). Archiving pauses the recurring items that move money
| out of or into it. Unarchiving resumes them from today on their original
| schedule (missed cycles are skipped, not back-filled), except the ones the
| user chose to end.
*/
const archiveInclude = {
  creditDetail: true,
  savingsGoals: { where: { isActive: true } },
};

const linkedAssetSelect = { select: { id: true, name: true, isActive: true } };

const pausedRecurringSelect = {
  id: true,
  type: true,
  description: true,
  amount: true,
  nextDueDate: true,
  startDate: true,
  endDate: true,
  interval: true,
  unit: true,
  daysOfMonth: true,
  fromAsset: linkedAssetSelect,
  toAsset: linkedAssetSelect,
};

// Recurring items that move money out of or into one of these accounts.
const linkedRecurringWhere = (userId, assetIds) => ({
  userId: Number(userId),
  isActive: true,
  OR: [{ fromAssetId: { in: assetIds } }, { toAssetId: { in: assetIds } }],
});

// What unarchiving `assetId` today does to a paused item: it resumes at its
// next due date on the original schedule, or ends if that falls after its
// end date. A transfer whose other account is still archived stays paused
// until that account is unarchived too.
const resumePlanFor = (item, assetId, today, timezone) => {
  const blockedBy = [item.fromAsset, item.toAsset].find(
    (a) => a && a.id !== assetId && !a.isActive,
  );
  if (blockedBy) {
    return { action: "STAYS_PAUSED", nextDueDate: null, blockedBy: blockedBy.name };
  }

  const due = moment(item.nextDueDate).tz(timezone).startOf("day");
  const next = due.isBefore(today) ? firstOccurrenceOnOrAfter(item, today, timezone) : due;
  const ends =
    item.endDate && next.isAfter(moment(item.endDate).tz(timezone).endOf("day"));

  return ends
    ? { action: "ENDS", nextDueDate: null, blockedBy: null }
    : { action: "RESUMES", nextDueDate: next.toDate(), blockedBy: null };
};

// Archived accounts list the items paused with them and what unarchiving
// today would do to each, for the unarchive dialog.
const withPausedRecurring = async (userId, accounts) => {
  if (!accounts.length) return accounts;

  const [paused, timezone] = await Promise.all([
    prisma.recurringTransaction.findMany({
      where: {
        ...linkedRecurringWhere(userId, accounts.map((a) => a.id)),
        status: "PAUSED",
      },
      select: pausedRecurringSelect,
      orderBy: { nextDueDate: "asc" },
    }),
    getUserTimezone(userId),
  ]);
  const today = moment().tz(timezone).startOf("day");

  return accounts.map((account) => ({
    ...account,
    pausedRecurring: paused
      .filter((item) => [item.fromAsset?.id, item.toAsset?.id].includes(account.id))
      .map((item) => ({
        id: item.id,
        type: item.type,
        description: item.description,
        amount: item.amount,
        fromAsset: item.fromAsset && { id: item.fromAsset.id, name: item.fromAsset.name },
        toAsset: item.toAsset && { id: item.toAsset.id, name: item.toAsset.name },
        resume: resumePlanFor(item, account.id, today, timezone),
      })),
  }));
};

// Cards have to be settled first: an archived account is read-only, so a
// balance or bill left on one could never be paid. Other accounts can be
// archived with a balance; it just drops out of net worth.
const assertCanArchive = async (userId, asset) => {
  if (asset.category !== "CREDIT") return;

  const [{ data }, pendingCount] = await Promise.all([
    getAssetBalance(userId, asset.id),
    prisma.expense.count({
      where: { assetId: asset.id, isActive: true, isPending: true },
    }),
  ]);

  const card = data[0];
  const owed = Number(card?.remainingBalance ?? 0);
  const unpaidStatement = card?.openStatements?.some(
    (s) => s.remainingOnStatement > 0.005,
  );

  if (owed > 0.005 || unpaidStatement) {
    throw new AppError(
      `Pay off ${asset.name} before archiving it. It still owes ${asset.currency} ${owed.toFixed(2)}.`,
      400,
    );
  }
  if (pendingCount) {
    throw new AppError(
      `${asset.name} has purchases that haven't posted yet. Mark them as posted before archiving it.`,
      400,
    );
  }
};

// `end`: ids of paused items to end instead of resuming (unarchive only).
export const archiveAsset = async (userId, id, { archived = true, end = [] } = {}) => {
  const asset = await validateAsset(id, userId);
  if (asset.isActive === !archived) return asset;

  const assetData = {
    isActive: !archived,
    closedAt: archived ? new Date() : null,
  };
  const linked = linkedRecurringWhere(userId, [asset.id]);

  /* ---------- Archive: pause its schedules ---------- */
  if (archived) {
    await assertCanArchive(userId, asset);

    const [, updated] = await prisma.$transaction([
      prisma.recurringTransaction.updateMany({
        where: { ...linked, status: "ACTIVE" },
        data: { status: "PAUSED" },
      }),
      prisma.asset.update({ where: { id: asset.id }, data: assetData, include: archiveInclude }),
    ]);
    return updated;
  }

  /* ---------- Unarchive: resume from today, or end ---------- */
  const timezone = await getUserTimezone(userId);
  const today = moment().tz(timezone).startOf("day");
  const endIds = new Set(end.map(Number));

  const paused = await prisma.recurringTransaction.findMany({
    where: { ...linked, status: "PAUSED" },
    select: pausedRecurringSelect,
  });

  return prisma.$transaction(async (tx) => {
    for (const item of paused) {
      const plan = endIds.has(item.id)
        ? { action: "ENDS" }
        : resumePlanFor(item, asset.id, today, timezone);
      if (plan.action === "STAYS_PAUSED") continue;

      await tx.recurringTransaction.update({
        where: { id: item.id },
        data:
          plan.action === "ENDS"
            ? { status: "ENDED", isActive: false, endedAt: new Date() }
            : { status: "ACTIVE", nextDueDate: plan.nextDueDate },
      });
    }

    return tx.asset.update({ where: { id: asset.id }, data: assetData, include: archiveInclude });
  });
};
/*
|--------------------------------------------------------------------------
| Update Asset
|--------------------------------------------------------------------------
| Category, subtype, currency and balance are immutable after creation (the
| edit dialog locks them) since changing them would corrupt the transaction
| history. Only descriptive fields and credit card details can change.
| Savings goals are edited through the savings goals API.
*/
export const updateAsset = async (
  userId,
  id,
  { name, color, institution, includeNetWorth, creditDetail },
) => {
  const existing = await validateAsset(id, userId);
  const isCredit = existing.category === "CREDIT";

  if (isCredit && creditDetail) {
    if (!creditDetail.creditLimit) {
      throw new AppError("creditLimit is required for CREDIT assets", 400);
    }
    assertDueRule(creditDetail);
    for (const [label, val] of [
      ["statementDate", creditDetail.statementDate],
      ["dueDate", creditDetail.dueDate],
    ]) {
      if (
        val !== undefined &&
        val !== null &&
        (Number(val) < 1 || Number(val) > 31)
      ) {
        throw new AppError(
          `${label} must be a day of month between 1 and 31`,
          400,
        );
      }
    }
  }

  const creditData = isCredit &&
    creditDetail && {
    creditLimit: parseFloat(creditDetail.creditLimit),
    statementDate: creditDetail.statementDate
      ? Number(creditDetail.statementDate)
      : null,
    ...dueRuleData(creditDetail),
  };

  return prisma.asset.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
      ...(institution !== undefined && { institution: institution || null }),
      ...(includeNetWorth !== undefined && {
        includeInNetWorth: includeNetWorth,
      }),
      ...(creditData && {
        creditDetail: { upsert: { create: creditData, update: creditData } },
      }),
    },
    include: {
      creditDetail: true,
      savingsGoals: { where: { isActive: true } },
    },
  });
};

/*
|--------------------------------------------------------------------------
| Get Asset Summary (with trend)
|--------------------------------------------------------------------------
*/
// archived: list archived accounts instead, with their paused recurring items.
export const getAsset = async (userId, id, from, to, { archived = false } = {}) => {
  const { data, total, netWorth, liabilities } = await getAssetBalance(
    userId,
    id,
    {
      from,
      to,
      archived,
    },
  );

  if (archived) return { data: await withPausedRecurring(userId, data) };

  return {
    data,
    total,
    liabilities,
    netWorth,
  };
};
/*
|--------------------------------------------------------------------------
| Get Asset Balance (Core Calculation)
|--------------------------------------------------------------------------
*/
export const getAssetBalance = async (
  userId,
  id,
  { netWorthOnly = false, from, to, asOf, postedOnly = false, archived = false } = {},
) => {
  const asOfFilter = asOf ? { date: { lte: new Date(asOf) } } : {};

  // postedOnly: the balance the bank shows, for card statements. Pending
  // purchases are left out and the rest are dated by when they posted.
  const expenseAsOfFilter = postedOnly
    ? postedExpenseWhere(asOf ? { lte: new Date(asOf) } : null)
    : asOfFilter;

  const rangeFilter =
    from || to
      ? {
        date: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }
      : null;

  const whereFor = (relationField, extra = {}) => ({
    isActive: true,
    status: "Completed",
    ...extra,
    [relationField]: {
      userId: Number(userId),
      ...(id ? { id: Number(id) } : {}),
    },
  });

  const assets = await prisma.asset.findMany({
    where: {
      userId: Number(userId),
      isActive: !archived,
      ...(id && { id: Number(id) }),
      ...(netWorthOnly && { includeInNetWorth: true }),
    },
    select: {
      id: true,
      name: true,
      category: true,
      subtype: true,
      currency: true,
      balance: true,
      institution: true,
      color: true,
      includeInNetWorth: true,

      loanDetail: {
        select: {
          originalPrincipal: true,
          interestRate: true,
          interestPeriod: true,
          interestMethod: true,
          termMonths: true,
          minimumPayment: true,
          nextDueDate: true,
        },
      },

      creditDetail: {
        select: {
          id: true,
          creditLimit: true,
          statementDate: true,
          dueDate: true,
          dueDaysAfterStatement: true,
        },
      },

      savingsGoals: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          targetAmount: true,
          targetDate: true,
        },
      },

      investmentPosition: {
        select: {
          symbol: true,
          quantity: true,
          averageCostBasis: true,
          valuationCurrency: true,
          lastPrice: true,
          lastPriceAt: true,
        },
      },
    },
  });

  const [incomes, expenses, transfersOut, transfersIn] = await Promise.all([
    prisma.income.groupBy({
      by: ["assetId"],
      where: whereFor("asset", asOfFilter),
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["assetId"],
      where: whereFor("asset", expenseAsOfFilter),
      _sum: { amount: true },
    }),
    prisma.transfer.groupBy({
      by: ["fromAssetId"],
      where: whereFor("fromAsset", asOfFilter),
      _sum: { amount: true },
    }),
    prisma.transfer.groupBy({
      by: ["toAssetId"],
      where: whereFor("toAsset", asOfFilter),
      _sum: { amount: true },
    }),
  ]);

  const [rangeIncomes, rangeExpenses] = rangeFilter
    ? await Promise.all([
      prisma.income.groupBy({
        by: ["assetId"],
        where: whereFor("asset", rangeFilter),
        _sum: { amount: true },
      }),
      prisma.expense.groupBy({
        by: ["assetId"],
        where: whereFor("asset", rangeFilter),
        _sum: { amount: true },
      }),
    ])
    : [[], []];

  const creditDetailIds = assets
    .filter((a) => a.category === "CREDIT" && a.creditDetail)
    .map((a) => a.creditDetail.id);

  const openStatements = creditDetailIds.length
    ? await prisma.creditStatement.findMany({
      where: {
        creditDetailId: { in: creditDetailIds },
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
      select: {
        id: true,
        creditDetailId: true,
        statementBalance: true,
        dueDate: true,
        payments: { select: { amount: true } },
      },
      orderBy: { dueDate: "asc" },
    })
    : [];

  const statementsByDetailId = new Map();
  for (const s of openStatements) {
    const list = statementsByDetailId.get(s.creditDetailId) ?? [];
    const paid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    list.push({
      statementId: s.id,
      dueDate: s.dueDate,
      remainingOnStatement: Number(s.statementBalance) - paid,
    });
    statementsByDetailId.set(s.creditDetailId, list);
  }

  const sumFor = (rows, key, assetId) =>
    Number(rows.find((r) => r[key] === assetId)?._sum.amount ?? 0);

  const settings = await prisma.settings.findFirst({
    where: { userId: Number(userId) },
  });
  const baseCurrency = settings?.currency;

  const uniqueForeignCurrencies = baseCurrency
    ? [
      ...new Set(
        assets.map((a) => a.currency).filter((c) => c && c !== baseCurrency),
      ),
    ]
    : [];

  const rateEntries = await Promise.all(
    uniqueForeignCurrencies.map(async (curr) => [
      curr,
      await getExchangeRates(curr, baseCurrency),
    ]),
  );
  const rateByCurrency = new Map(rateEntries);

  const data = assets.map((asset) => {
    const totalIncomes = sumFor(incomes, "assetId", asset.id);
    const totalExpenses = sumFor(expenses, "assetId", asset.id);
    const totalTransferOut = sumFor(transfersOut, "fromAssetId", asset.id);
    const totalTransferIn = sumFor(transfersIn, "toAssetId", asset.id);

    const isCredit = asset.category === "CREDIT" && asset.creditDetail;

    // CASH/BANK/LOAN/INVESTMENT: expenses reduce, transferIn increases (it's an asset).
    // CREDIT: charges increase what's owed, payments (transferIn) decrease it — inverse.
    const remainingBalance = isCredit
      ? Number(asset.balance) +
      totalExpenses -
      totalIncomes +
      totalTransferOut -
      totalTransferIn
      : Number(asset.balance) +
      totalIncomes -
      totalExpenses -
      totalTransferOut +
      totalTransferIn;

    const rate =
      baseCurrency && asset.currency !== baseCurrency
        ? rateByCurrency.get(asset.currency)
        : 1;
    const convertedBalance = remainingBalance * (rate ?? 1);

    const openStatementsForAsset = isCredit
      ? (statementsByDetailId.get(asset.creditDetail.id) ?? [])
      : [];

    return {
      ...asset,
      totalIncomes,
      totalExpenses,
      totalTransferOut,
      totalTransferIn,
      remainingBalance,
      convertedBalance,
      ...(isCredit && {
        remainingCredit:
          Number(asset.creditDetail.creditLimit) - remainingBalance,
        openStatements: openStatementsForAsset,
        // Never more than the card owes, so an archived purchase can't leave a
        // bill that payments are already refused for.
        pendingDue: Math.min(
          openStatementsForAsset[0]?.remainingOnStatement ?? 0,
          Math.max(remainingBalance, 0),
        ),
      }),
      ...(rangeFilter && {
        rangeIncome: sumFor(rangeIncomes, "assetId", asset.id),
        rangeExpense: sumFor(rangeExpenses, "assetId", asset.id),
      }),
    };
  });

  const totalAssets = data
    .filter((a) => !isLiabilityCategory(a.category))
    .reduce((sum, a) => sum + a.convertedBalance, 0);

  const totalLiabilities = data
    .filter((a) => a.includeInNetWorth && isLiabilityCategory(a.category))
    .reduce((sum, a) => sum + a.convertedBalance, 0);

  const netWorth =
    data
      .filter((a) => a.includeInNetWorth && !isLiabilityCategory(a.category))
      .reduce((sum, a) => sum + a.convertedBalance, 0) - totalLiabilities;

  return {
    data,
    total: totalAssets,
    liabilities: totalLiabilities,
    netWorth,
  };
};
/*
|--------------------------------------------------------------------------
| Assert Can Spend
|--------------------------------------------------------------------------
| Shared guard for money leaving an account. CASH/BANK need enough balance;
| CREDIT needs enough room under the credit limit (remainingCredit).
| `restore` is the amount of the transaction being edited, which is already
| counted against the account, so it is added back before comparing.
*/
export const assertCanSpend = async (userId, assetId, amount, { restore = 0 } = {}) => {
  const result = await getAssetBalance(userId, assetId);
  const asset = result?.data?.[0];
  if (!asset) throw await accountUnavailableError(userId, assetId);

  if (asset.category === "CREDIT") {
    const available = Number(asset.remainingCredit ?? 0) + Number(restore);
    if (Number(amount) > available) {
      throw new AppError(`Credit limit exceeded. Available credit: ${available.toFixed(2)}`, 400);
    }
  } else if (Number(amount) > Number(asset.remainingBalance) + Number(restore)) {
    throw new AppError("Insufficient balance", 400);
  }

  return asset;
};

/*
|--------------------------------------------------------------------------
| Assert Can Receive
|--------------------------------------------------------------------------
| Guard for money arriving in an account. Only CREDIT is limited: a payment
| can't exceed what the card currently owes, otherwise its balance goes
| negative. `restore` is the amount of the payment being edited, which is
| already reducing the owed balance.
*/
export const assertCanReceive = async (userId, assetId, amount, { restore = 0 } = {}) => {
  const result = await getAssetBalance(userId, assetId);
  const asset = result?.data?.[0];
  if (!asset) throw await accountUnavailableError(userId, assetId);

  if (asset.category === "CREDIT") {
    const owed = Math.max(Number(asset.remainingBalance), 0) + Number(restore);
    if (Number(amount) > owed) {
      throw new AppError(
        `Payment exceeds the amount owed on ${asset.name}. Amount owed: ${owed.toFixed(2)}`,
        400,
      );
    }
  }

  return asset;
};

const sumAmounts = (transactions) =>
  transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
export const LIABILITY_CATEGORIES = ["CREDIT", "LOAN"];

export const isLiabilityCategory = (category) =>
  LIABILITY_CATEGORIES.includes(category.toUpperCase());
