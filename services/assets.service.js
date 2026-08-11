import { AppError } from "../utils/AppError.js";

import { prisma } from "../config/prisma.js";
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
| Create Asset
|--------------------------------------------------------------------------
*/
export const createAsset = async (
  name,
  balance,
  currency,
  type,
  subtype,
  creditLimit,
  color,
  icon,
  userId,
  includeNetWorth
) => {
  const asset = await prisma.asset.create({
    data: {
      name,
      balance: parseFloat(balance),
      includeInNetWorth: includeNetWorth,

      category: type,
      currency,

      ...(subtype && {
        subtype,
      }),

      ...(type === "CREDIT" && {
        creditDetail: {
          create: {
            creditLimit: parseFloat(creditLimit),
            statementDate: statementDate ? Number(statementDate) : null,
            dueDate: dueDate ? Number(dueDate) : null,
            minimumPayment: minimumPayment
              ? parseFloat(minimumPayment)
              : null,
          },
        },
      }),

      color,
      icon,

      user: {
        connect: {
          id: Number(userId),
        },
      },
    },
    include: {
      creditDetail: true,
    },
  });

  return asset
};

/*
|--------------------------------------------------------------------------
| Get Asset Summary (with trend)
|--------------------------------------------------------------------------
*/
export const getAsset = async (userId, id, from, to) => {
  const { data, total, netWorth } = await getAssetBalance(userId, id, {
    from,
    to,
  });

  return {
    data,
    total,
    netWorth,
  };
};
/*
|--------------------------------------------------------------------------
| Get Asset Balance (Core Calculation)
|--------------------------------------------------------------------------
*/
export const getAssetBalance = async (userId, id, { netWorthOnly = false, from, to } = {}) => {
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
    [relationField]: { userId: Number(userId), ...(id ? { id: Number(id) } : {}) },
  });

  const assets = await prisma.asset.findMany({
    where: {
      userId: Number(userId),
      ...(id ? { id: Number(id) } : {}),
      ...(netWorthOnly && { includeInNetWorth: true }),
    },
    select: {
      id: true,
      name: true,
      balance: true,
      currency: true,
      category: true,
      includeInNetWorth: true,
    },
  });

  // Full-history sums — always unfiltered by date, since remainingBalance
  // is a running total and breaks if any transactions are excluded.
  const [incomes, expenses, transfersOut, transfersIn] = await Promise.all([
    prisma.income.groupBy({ by: ["assetId"], where: whereFor("asset"), _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["assetId"], where: whereFor("asset"), _sum: { amount: true } }),
    prisma.transfer.groupBy({ by: ["fromAssetId"], where: whereFor("fromAsset"), _sum: { amount: true } }),
    prisma.transfer.groupBy({ by: ["toAssetId"], where: whereFor("toAsset"), _sum: { amount: true } }),
  ]);

  // Period-scoped sums — only run when a range is actually requested,
  // purely for display (e.g. "this month's income/expense" on a card).
  const [rangeIncomes, rangeExpenses] = rangeFilter
    ? await Promise.all([
      prisma.income.groupBy({ by: ["assetId"], where: whereFor("asset", rangeFilter), _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ["assetId"], where: whereFor("asset", rangeFilter), _sum: { amount: true } }),
    ])
    : [[], []];

  const sumFor = (rows, key, assetId) =>
    Number(rows.find((r) => r[key] === assetId)?._sum.amount ?? 0);

  const data = assets.map((asset) => {
    const totalIncomes = sumFor(incomes, "assetId", asset.id);
    const totalExpenses = sumFor(expenses, "assetId", asset.id);
    const totalTransferOut = sumFor(transfersOut, "fromAssetId", asset.id);
    const totalTransferIn = sumFor(transfersIn, "toAssetId", asset.id);
    const remainingBalance =
      Number(asset.balance) + totalIncomes - totalExpenses - totalTransferOut + totalTransferIn;

    return {
      ...asset,
      totalIncomes,
      totalExpenses,
      totalTransferOut,
      totalTransferIn,
      remainingBalance,
      ...(rangeFilter && {
        rangeIncome: sumFor(rangeIncomes, "assetId", asset.id),
        rangeExpense: sumFor(rangeExpenses, "assetId", asset.id),
      }),
    };
  });

  return {
    data,
    total: data.reduce((sum, a) => sum + a.remainingBalance, 0),
    netWorth: data
      .filter((a) => a.includeInNetWorth)
      .reduce((sum, a) => sum + a.remainingBalance, 0),
  };
};

const sumAmounts = (transactions) =>
  transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);