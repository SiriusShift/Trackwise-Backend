import { AppError } from "../utils/AppError.js";

import { prisma } from "../config/prisma.js";
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
| Create Asset
|--------------------------------------------------------------------------
*/
export const createAsset = async (
  name,
  balance,
  currency,
  type,
  subtype,
  color,
  userId,
  includeNetWorth,
  creditDetail
) => {
  if (type === "CREDIT") {
    if (!creditDetail?.creditLimit) {
      throw new AppError("creditLimit is required for CREDIT assets", 400);
    }
    for (const [label, val] of [
      ["statementDate", creditDetail?.statementDate],
      ["dueDate", creditDetail?.dueDate],
    ]) {
      if (val !== undefined && val !== null && (Number(val) < 1 || Number(val) > 31)) {
        throw new AppError(`${label} must be a day of month between 1 and 31`, 400);
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
            statementDate: creditDetail?.statementDate ? Number(creditDetail?.statementDate) : null,
            dueDate: creditDetail?.dueDate ? Number(creditDetail?.dueDate) : null,
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
    },
  });

  return asset;
};

export const updateAsset = async (
  id,
  name,
  balance,
  currency,
  type,
  subtype,
  color,
  includeNetWorth,
  creditDetail
) => {
  if (type === "CREDIT") {
    if (!creditDetail?.creditLimit) {
      throw new AppError("creditLimit is required for CREDIT assets", 400);
    }

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
          400
        );
      }
    }
  }

  const asset = await prisma.asset.update({
    where: {
      id: Number(id),
    },
    data: {
      name,
      balance: parseFloat(balance),
      currency,
      category: type,
      subtype: subtype ?? null,
      color,
      includeInNetWorth: includeNetWorth,

      ...(type === "CREDIT"
        ? {
          creditDetail: {
            upsert: {
              create: {
                creditLimit: parseFloat(creditDetail.creditLimit),
                statementDate: creditDetail.statementDate
                  ? Number(creditDetail.statementDate)
                  : null,
                dueDate: creditDetail.dueDate
                  ? Number(creditDetail.dueDate)
                  : null,
              },
              update: {
                creditLimit: parseFloat(creditDetail.creditLimit),
                statementDate: creditDetail.statementDate
                  ? Number(creditDetail.statementDate)
                  : null,
                dueDate: creditDetail.dueDate
                  ? Number(creditDetail.dueDate)
                  : null,
              },
            },
          },
        }
        : {
          creditDetail: {
            delete: {},
          },
        }),
    },
    include: {
      creditDetail: true,
    },
  });

  return asset;
};
/*
|--------------------------------------------------------------------------
| Get Asset Summary (with trend)
|--------------------------------------------------------------------------
*/
export const getAsset = async (userId, id, from, to) => {
  const { data, total, netWorth, liabilities } = await getAssetBalance(userId, id, {
    from,
    to,
  });

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
export const getAssetBalance = async (userId, id, { netWorthOnly = false, from, to, asOf } = {}) => {
  const asOfFilter = asOf ? { date: { lte: new Date(asOf) } } : {};

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
        },
      },

      investmentPosition: {
        select: {
          symbol: true,
          quantity: true,
          averageCostBasis: true,
          valuationCurrency: true,
          lastPrice: true,
          lastPriceAt: true
        },
      },
    },
  });

  const [incomes, expenses, transfersOut, transfersIn] = await Promise.all([
    prisma.income.groupBy({ by: ["assetId"], where: whereFor("asset", asOfFilter), _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["assetId"], where: whereFor("asset", asOfFilter), _sum: { amount: true } }),
    prisma.transfer.groupBy({ by: ["fromAssetId"], where: whereFor("fromAsset", asOfFilter), _sum: { amount: true } }),
    prisma.transfer.groupBy({ by: ["toAssetId"], where: whereFor("toAsset", asOfFilter), _sum: { amount: true } }),
  ]);

  const [rangeIncomes, rangeExpenses] = rangeFilter
    ? await Promise.all([
      prisma.income.groupBy({ by: ["assetId"], where: whereFor("asset", rangeFilter), _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ["assetId"], where: whereFor("asset", rangeFilter), _sum: { amount: true } }),
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
        minimumPaymentDue: true,
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
    where: { userId: Number(userId) }
  });
  const baseCurrency = settings?.currency;

  const uniqueForeignCurrencies = baseCurrency
    ? [...new Set(assets.map((a) => a.currency).filter((c) => c && c !== baseCurrency))]
    : [];

  const rateEntries = await Promise.all(
    uniqueForeignCurrencies.map(async (curr) => [curr, await getExchangeRates(curr, baseCurrency)])
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
      ? Number(asset.balance) + totalExpenses - totalIncomes + totalTransferOut - totalTransferIn
      : Number(asset.balance) + totalIncomes - totalExpenses - totalTransferOut + totalTransferIn;

    const rate = baseCurrency && asset.currency !== baseCurrency
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
        remainingCredit: Number(asset.creditDetail.creditLimit) - remainingBalance,
        openStatements: openStatementsForAsset,
        pendingDue: openStatementsForAsset[0]?.remainingOnStatement ?? 0,
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

  const netWorth = data
    .filter((a) => a.includeInNetWorth && !isLiabilityCategory(a.category))
    .reduce((sum, a) => sum + a.convertedBalance, 0) - totalLiabilities;

  return {
    data,
    total: totalAssets,
    liabilities: totalLiabilities,
    netWorth,
  };
};
const sumAmounts = (transactions) =>
  transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
export const LIABILITY_CATEGORIES = ["CREDIT", "LOAN"];

export const isLiabilityCategory = (category) =>
  LIABILITY_CATEGORIES.includes(category.toUpperCase());