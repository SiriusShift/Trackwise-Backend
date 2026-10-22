import moment from "moment-timezone";

import { validateExpense } from "./expenses.service.js";
import { validateIncome } from "./incomes.service.js";
import { validateTransfers } from "./transfers.service.js";

import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  assertCanReceive,
  assertCanSpend,
  getAssetBalance,
} from "./assets.service.js";
import { syncCreditStatements } from "./schedules.service.js";
import { getUserTimezone } from "../utils/userTimezone.js";
/*
|--------------------------------------------------------------------------
| Get History (Paginated)
|--------------------------------------------------------------------------
*/
export const getHistory = async (userId, request) => {
  const { pageIndex, pageSize } = request;

  const page = Number(pageIndex) >= 0 ? Number(pageIndex) + 1 : 1;
  const size = Number(pageSize) > 0 ? Number(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    isActive: true,
    userId: Number(userId),
    status: "Completed",
  };

  /*
  |--------------------------------------------------------------------------
  | Total Count
  |--------------------------------------------------------------------------
  */
  const [expenseCount, incomeCount, transferCount] = await Promise.all([
    prisma.expense.count({ where: filters }),
    prisma.income.count({ where: filters }),
    prisma.transfer.count({ where: filters }),
  ]);

  const totalCount = expenseCount + incomeCount + transferCount;

  /*
  |--------------------------------------------------------------------------
  | Fetch Transactions
  |--------------------------------------------------------------------------
  */
  const [expenses, incomes, transfers] = await Promise.all([
    prisma.expense.findMany({
      where: filters,
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        status: true,

        category: {
          select: {
            name: true,
            icon: true,
          },
        },

        asset: {
          select: {
            id: true,
            name: true,
            balance: true,
          },
        },
      },
    }),

    prisma.income.findMany({
      where: filters,
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        status: true,

        category: {
          select: {
            name: true,
            icon: true,
          },
        },

        asset: {
          select: {
            id: true,
            name: true,
            balance: true,
          },
        },
      },
    }),

    prisma.transfer.findMany({
      where: filters,
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        status: true,

        category: {
          select: {
            name: true,
            icon: true,
          },
        },

        fromAsset: {
          select: {
            id: true,
            name: true,
            balance: true,
          },
        },

        toAsset: {
          select: {
            id: true,
            name: true,
            balance: true,
          },
        },
      },
    }),
  ]);

  /*
  |--------------------------------------------------------------------------
  | Normalize Data
  |--------------------------------------------------------------------------
  */
  const formattedExpenses = expenses.map((item) => ({
    id: item.id,
    type: "Expense",
    amount: item.amount,
    description: item.description,
    date: item.date,
    status: item.status,
    category: item.category,
    asset: item.asset,
  }));

  const formattedIncomes = incomes.map((item) => ({
    id: item.id,
    type: "Income",
    amount: item.amount,
    description: item.description,
    date: item.date,
    status: item.status,
    category: item.category,
    asset: item.asset,
  }));

  const formattedTransfers = transfers.map((item) => ({
    id: item.id,
    type: "Transfer",
    amount: item.amount,
    description: item.description,
    date: item.date,
    status: item.status,
    category: item.category,
    fromAsset: item.fromAsset,
    toAsset: item.toAsset,
  }));

  /*
  |--------------------------------------------------------------------------
  | Merge + Sort + Paginate
  |--------------------------------------------------------------------------
  */
  const mergedTransactions = [
    ...formattedExpenses,
    ...formattedIncomes,
    ...formattedTransfers,
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(skip, skip + size);

  return {
    data: mergedTransactions,
    totalCount,
    totalPages: Math.ceil(totalCount / size),
  };
};
/*
|--------------------------------------------------------------------------
| Liquid Balance
|--------------------------------------------------------------------------
| Active, net-worth assets only. Each balance is the asset's starting
| balance plus all activity up to `asOf` (or all-time when omitted).
|
| `options.categories` narrows the assets to specific categories, e.g.
| ["CASH", "BANK"] for spendable money. Omitted = every net-worth asset
| (current behaviour, so existing callers are unaffected).
*/
export const LIQUID_CATEGORIES = ["CASH", "BANK"];

export const getLiquidBalance = async (userId, asOf, { categories } = {}) => {
  const assets = await prisma.asset.findMany({
    where: {
      userId,
      includeInNetWorth: true,
      isActive: true,
      ...(categories?.length && { category: { in: categories } }),
    },
    select: {
      id: true,
      name: true,
      balance: true,
      color: true,
      category: true,
    },
  });

  const assetIds = assets.map((a) => a.id);

  const where = (assetField) => ({
    userId,
    isActive: true,
    [assetField]: { in: assetIds },
    ...(asOf && { date: { lte: asOf } }),
  });

  const [incomes, expenses, transfersOut, transfersIn] = await Promise.all([
    prisma.income.groupBy({
      by: ["assetId"],
      _sum: { amount: true },
      where: where("assetId"),
    }),
    prisma.expense.groupBy({
      by: ["assetId"],
      _sum: { amount: true },
      where: { ...where("assetId"), status: "Completed" },
    }),
    prisma.transfer.groupBy({
      by: ["fromAssetId"],
      _sum: { amount: true },
      where: where("fromAssetId"),
    }),
    prisma.transfer.groupBy({
      by: ["toAssetId"],
      _sum: { amount: true },
      where: where("toAssetId"),
    }),
  ]);

  const toMap = (rows, key) =>
    Object.fromEntries(rows.map((r) => [r[key], Number(r._sum.amount ?? 0)]));

  const incomeBy = toMap(incomes, "assetId");
  const expenseBy = toMap(expenses, "assetId");
  const outBy = toMap(transfersOut, "fromAssetId");
  const inBy = toMap(transfersIn, "toAssetId");

  const balances = assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    color: asset.color,
    category: asset.category,
    balance:
      Number(asset.balance) +
      (incomeBy[asset.id] ?? 0) -
      (expenseBy[asset.id] ?? 0) -
      (outBy[asset.id] ?? 0) +
      (inBy[asset.id] ?? 0),
  }));

  return {
    assetIds,
    assets: balances,
    total: balances.reduce((sum, a) => sum + a.balance, 0),
  };
};

/*
|--------------------------------------------------------------------------
| Statistics
|--------------------------------------------------------------------------
*/
export const getStatistics = async (userId, data) => {
  const { startDate, endDate, mode } = data;

  const tz = await getUserTimezone(userId);

  const start = moment.tz(startDate, tz).startOf(mode).toDate();
  const end = moment.tz(endDate, tz).endOf(mode).toDate();

  const prevStart = moment
    .tz(startDate, tz)
    .subtract(1, mode)
    .startOf(mode)
    .toDate();
  const prevEnd = moment.tz(endDate, tz).subtract(1, mode).endOf(mode).toDate();

  const dateFilter = { gte: start, lte: end };
  const prevDateFilter = { gte: prevStart, lte: prevEnd };

  // `current` covers every net-worth asset and scopes the income/expense
  // queries (card spending is still spending). `liquid`/`prevLiquid` cover
  // spendable accounts only and drive the headline balance and breakdown.
  const liquidOptions = { categories: LIQUID_CATEGORIES };
  // Net worth comes from getAssetBalance, which subtracts liabilities
  // (CREDIT/LOAN) and handles credit sign + currency conversion;
  // getLiquidBalance sums every asset as a positive balance.
  const [current, netWorthNow, netWorthPrev, liquid, prevLiquid] =
    await Promise.all([
      getLiquidBalance(userId, end),
      getAssetBalance(userId, null, { netWorthOnly: true, asOf: end }),
      getAssetBalance(userId, null, { netWorthOnly: true, asOf: prevEnd }),
      getLiquidBalance(userId, end, liquidOptions),
      getLiquidBalance(userId, prevEnd, liquidOptions),
    ]);
  const netWorthAssetIds = current.assetIds;
  const assetBreakdown = liquid.assets
    .filter((a) => a.balance !== 0)
    .map(({ name, color, balance }) => ({ name, color, balance }));

  /*
  |--------------------------------------------------------------------------
  | Category Breakdown
  |--------------------------------------------------------------------------
  */
  const getCategoryBreakdown = async (type, filter) => {
    const model = type === "Income" ? prisma.income : prisma.expense;
    const statusFilter = type === "Expense" ? { status: "Completed" } : {};

    const records = await model.findMany({
      where: {
        userId,
        isActive: true,
        date: filter,
        assetId: { in: netWorthAssetIds },
        ...statusFilter,
      },
      select: {
        amount: true,
        category: { select: { name: true, color: true } },
      },
    });

    const grouped = records.reduce((acc, item) => {
      const categoryName = item.category?.name || "Unknown";
      const categoryColor = item.category?.color || "Unknown";

      if (!acc[categoryName]) {
        acc[categoryName] = {
          name: categoryName,
          color: categoryColor,
          amount: 0,
        };
      }
      acc[categoryName].amount += Number(item.amount);
      return acc;
    }, {});

    return Object.values(grouped);
  };

  /*
  |--------------------------------------------------------------------------
  | Aggregates
  |--------------------------------------------------------------------------
  */
  const [
    income,
    expense,
    prevIncome,
    prevExpense,
    incomeBreakdown,
    expenseBreakdown,
  ] = await Promise.all([
    prisma.income.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        isActive: true,
        date: dateFilter,
        assetId: { in: netWorthAssetIds },
      },
    }),

    prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        isActive: true,
        date: dateFilter,
        status: "Completed",
        assetId: { in: netWorthAssetIds },
      },
    }),

    prisma.income.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        isActive: true,
        date: prevDateFilter,
        assetId: { in: netWorthAssetIds },
      },
    }),

    prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        isActive: true,
        date: prevDateFilter,
        status: "Completed",
        assetId: { in: netWorthAssetIds },
      },
    }),

    getCategoryBreakdown("Income", dateFilter),
    getCategoryBreakdown("Expense", dateFilter),
  ]);

  /*
  |--------------------------------------------------------------------------
  | Balance
  |--------------------------------------------------------------------------
  */
  const balance = liquid.total;
  const prevBalance = prevLiquid.total;

  /*
  |--------------------------------------------------------------------------
  | Trend Calculator
  |--------------------------------------------------------------------------
  */
  const trend = (curr, prev) => {
    const current = Number(curr ?? 0);
    const previous = Number(prev ?? 0);
    if (!previous) return 0;
    return Number((((current - previous) / previous) * 100).toFixed(2));
  };

  return {
    balance,
    income: Number(income._sum.amount ?? 0),
    expense: Number(expense._sum.amount ?? 0),
    incomeTrend: trend(income._sum.amount, prevIncome._sum.amount),
    expenseTrend: trend(expense._sum.amount, prevExpense._sum.amount),
    balanceTrend: trend(balance, prevBalance),
    netWorth: netWorthNow.netWorth,
    netWorthTrend: trend(netWorthNow.netWorth, netWorthPrev.netWorth),
    // Peso change in amount owed over the period (positive = debt grew).
    liabilitiesChange: netWorthNow.liabilities - netWorthPrev.liabilities,
    assetBreakdown,
    incomeBreakdown,
    expenseBreakdown,
  };
};

/*
|--------------------------------------------------------------------------
| Archive Transaction
|--------------------------------------------------------------------------
*/
export const archiveTransaction = async (type, id, userId) => {
  switch (type) {
    case "expense":
      await validateExpense(id, userId);
      break;
    case "income":
      await validateIncome(id, userId);
      break;
    case "transfer":
      await validateTransfers(id, userId);
      break;
  }

  // Archiving a card purchase also stops its installment plan: drop the
  // installments not yet billed and cancel the plan, keeping billed ones as history.
  if (type === "expense") {
    const expenseId = Number(id);

    await prisma.$transaction([
      prisma.creditInstallment.deleteMany({
        where: { statementId: null, plan: { expenseId } },
      }),
      prisma.creditInstallmentPlan.updateMany({
        where: { expenseId },
        data: { status: "CANCELLED" },
      }),
      prisma.expense.update({
        where: { id: expenseId },
        data: { isActive: false },
      }),
    ]);

    // Settle any open card bill the archived purchase was part of.
    await syncCreditStatements(userId);

    return;
  }

  const modelMap = {
    income: prisma.income,
    transfer: prisma.transfer,
  };

  const model = modelMap[type];

  await model.update({
    where: { id: Number(id) },
    data: { isActive: false },
  });

  return;
};

/*
|--------------------------------------------------------------------------
| Restore Transaction
|--------------------------------------------------------------------------
| Undoes archiveTransaction. A card purchase with an installment plan can't
| be restored: archiving it cancelled the plan and removed its unbilled
| installments, so it has to be recreated.
*/
export const restoreTransaction = async (type, id, userId) => {
  const where = { id: Number(id), userId: Number(userId) };

  const row =
    type === "expense"
      ? await prisma.expense.findFirst({
          where,
          include: { creditInstallmentPlan: { select: { id: true } } },
        })
      : await prisma[type].findFirst({ where });

  if (!row) throw new AppError("Transaction not found", 404);
  if (row.isActive) throw new AppError("Transaction is not archived", 400);

  if (type === "expense" && row.creditInstallmentPlan) {
    throw new AppError(
      "This purchase had an installment plan and can't be restored. Create the purchase again with its installment plan.",
      400,
    );
  }

  // Restoring puts the amount back on the account, so apply the same
  // balance and limit rules as creating it (only once it has taken effect).
  const amount = Number(row.amount);
  const takesEffect = row.status === "Completed" && row.date <= new Date();

  if (takesEffect) {
    if (type === "expense" && row.assetId) {
      await assertCanSpend(userId, row.assetId, amount);
    } else if (type === "transfer") {
      await assertCanSpend(userId, row.fromAssetId, amount);
      await assertCanReceive(userId, row.toAssetId, amount);
    }
  }

  await prisma[type].update({
    where: { id: row.id },
    data: { isActive: true },
  });

  await syncCreditStatements(userId);
};

/*
|--------------------------------------------------------------------------
| Runway
|--------------------------------------------------------------------------
| Inputs for the "when will the money run out" projection: spendable
| balance as of now, plus the average daily variable (non-recurring) income
| and expense over the trailing window. Recurring items are projected from
| their schedules separately, so they are excluded here to avoid counting
| them twice.
*/
const RUNWAY_WINDOW_DAYS = 30;
const MIN_RUNWAY_DAYS = 7;

export const getRunway = async (userId) => {
  const tz = await getUserTimezone(userId);
  const now = moment.tz(tz);
  const windowStart = now
    .clone()
    .subtract(RUNWAY_WINDOW_DAYS, "days")
    .startOf("day");

  const { assetIds, total: liquidBalance } = await getLiquidBalance(
    userId,
    now.toDate(),
    { categories: LIQUID_CATEGORIES },
  );

  const flowWhere = {
    userId,
    isActive: true,
    recurringId: null,
    assetId: { in: assetIds },
    date: { gte: windowStart.toDate(), lte: now.toDate() },
  };

  const [expenses, incomes, oldestExpense, oldestIncome] = await Promise.all([
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { ...flowWhere, status: "Completed" },
    }),
    prisma.income.aggregate({
      _sum: { amount: true },
      where: flowWhere,
    }),
    prisma.expense.findFirst({
      where: { userId, isActive: true, assetId: { in: assetIds } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.income.findFirst({
      where: { userId, isActive: true, assetId: { in: assetIds } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);

  // Days of history we actually have, capped at the window, so a new user
  // isn't averaged over 30 days of nothing.
  const oldest = [oldestExpense?.date, oldestIncome?.date]
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  const daysOfData = oldest
    ? Math.min(
        RUNWAY_WINDOW_DAYS,
        Math.max(1, now.diff(moment.tz(oldest, tz).startOf("day"), "days") + 1),
      )
    : 0;

  const avgDailyExpense = daysOfData
    ? Number(expenses._sum.amount ?? 0) / daysOfData
    : 0;
  const avgDailyIncome = daysOfData
    ? Number(incomes._sum.amount ?? 0) / daysOfData
    : 0;

  return {
    liquidBalance,
    avgDailyExpense,
    avgDailyIncome,
    netDaily: avgDailyIncome - avgDailyExpense,
    daysOfData,
    hasEnoughData: daysOfData >= MIN_RUNWAY_DAYS,
  };
};
