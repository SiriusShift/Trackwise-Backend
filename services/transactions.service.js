import { PrismaClient } from "@prisma/client";
import moment from "moment";

import { validateAsset } from "./assets.service.js";
import { validateTransfers } from "./transfers.service.js";
import { validateExpense } from "./expenses.service.js";
import { validateIncome } from "./incomes.service.js";

import {
  uploadFileToS3,
  deleteFileFromS3,
} from "../services/s3.service.js";

const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| Validate Transaction History
|--------------------------------------------------------------------------
*/
export const validateTransactionHistory = async (id) => {
  const history = await prisma.transactionHistory.findFirst({
    where: { id: Number(id) },
  });

  if (!history) throw new Error("History not found");

  return history;
};

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
| Statistics
|--------------------------------------------------------------------------
*/
export const getStatistics = async (userId, data) => {
  const { startDate, endDate, mode } = data;

  const start = moment(startDate).startOf(mode).toDate();
  const end = moment(endDate).endOf(mode).toDate();

  const prevStart = moment(startDate)
    .clone()
    .subtract(1, mode)
    .startOf(mode)
    .toDate();

  const prevEnd = moment(endDate) 
    .clone()
    .subtract(1, mode)
    .endOf(mode)
    .toDate();

  const dateFilter = {
    gte: start,
    lte: end,
  };

  const prevDateFilter = {
    gte: prevStart,
    lte: prevEnd,
  };

  /*
  |--------------------------------------------------------------------------
  | Assets
  |--------------------------------------------------------------------------
  */
  const [assetsResult, assets, assetIncomes, assetExpenses] = await Promise.all([
    prisma.asset.aggregate({
      _sum: { balance: true },
      where: { isActive: true, userId },
    }),

    prisma.asset.findMany({
      where: { isActive: true, userId },
      select: { id: true, name: true, balance: true, color: true },
    }),

    // All-time income grouped by asset
    prisma.income.groupBy({
      by: ["assetId"],
      _sum: { amount: true },
      where: { userId, isActive: true },
    }),

    // All-time expense grouped by asset
    prisma.expense.groupBy({
      by: ["assetId"],
      _sum: { amount: true },
      where: { userId, isActive: true },
    }),
  ]);

  // Build lookup maps for O(1) access
  const incomeByAsset = Object.fromEntries(
    assetIncomes.map((r) => [r.assetId, Number(r._sum.amount ?? 0)])
  );
  const expenseByAsset = Object.fromEntries(
    assetExpenses.map((r) => [r.assetId, Number(r._sum.amount ?? 0)])
  );

  const assetBreakdown = assets.map((asset) => {
    const initial = Number(asset.balance);
    const income  = incomeByAsset[asset.id]  ?? 0;
    const expense = expenseByAsset[asset.id] ?? 0;

    return {
      name:    asset.name,
      color:   asset.color,
      balance: initial + income - expense,   // dynamic total
    };
  });

  /*
  |--------------------------------------------------------------------------
  | Category Breakdown
  |--------------------------------------------------------------------------
  */
  const getCategoryBreakdown = async (type, dateFilter) => {
    const model =
      type === "Income"
        ? prisma.income
        : prisma.expense;

    const records = await model.findMany({
      where: {
        userId,
        isActive: true,
        date: dateFilter,
      },
      select: {
        amount: true,

        category: {
          select: {
            name: true,
            color: true
          },
        },

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
    allIncome,
    allExpense,
    prevAllIncome,
    prevAllExpense,
    incomeBreakdown,
    expenseBreakdown,
  ] = await Promise.all([
    prisma.income.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        isActive: true,
        date: dateFilter,
      },
    }),

    prisma.expense.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        isActive: true,
        date: dateFilter,
      },
    }),

    prisma.income.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        isActive: true,
        date: prevDateFilter,
      },
    }),

    prisma.expense.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        isActive: true,
        date: prevDateFilter,
      },
    }),

    prisma.income.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        isActive: true,
      },
    }),

    prisma.expense.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        isActive: true,
      },
    }),

    prisma.income.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        isActive: true,
        date: {
          lte: prevEnd,
        },
      },
    }),

    prisma.expense.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        userId,
        isActive: true,
        date: {
          lte: prevEnd,
        },
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
  const baseBalance = Number(assetsResult._sum.balance ?? 0);

  const balance =
    baseBalance +
    Number(allIncome._sum.amount ?? 0) -
    Number(allExpense._sum.amount ?? 0);

  const prevBalance =
    baseBalance +
    Number(prevAllIncome._sum.amount ?? 0) -
    Number(prevAllExpense._sum.amount ?? 0);

  /*
  |--------------------------------------------------------------------------
  | Trend Calculator
  |--------------------------------------------------------------------------
  */
  const trend = (curr, prev) => {
    const current = Number(curr ?? 0);
    const previous = Number(prev ?? 0);

    if (!previous) return 0;

    return Number(
      (((current - previous) / previous) * 100).toFixed(2),
    );
  };

  return {
    balance,

    income: Number(income._sum.amount ?? 0),

    expense: Number(expense._sum.amount ?? 0),

    incomeTrend: trend(
      income._sum.amount,
      prevIncome._sum.amount,
    ),

    expenseTrend: trend(
      expense._sum.amount,
      prevExpense._sum.amount,
    ),

    balanceTrend: trend(balance, prevBalance),

    assetBreakdown,

    incomeBreakdown,

    expenseBreakdown,
  };
};

/*
|--------------------------------------------------------------------------
| Edit History
|--------------------------------------------------------------------------
*/
export const editHistory = async (userId, data, file, id) => {
  const history = await validateTransactionHistory(id);

  let image = history.image;

  if (file) {
    image = await uploadFileToS3(file, "Expense", userId);

    if (history.image) {
      await deleteFileFromS3(history.image);
    }
  }

  const transaction = await prisma.transactionHistory.update({
    where: { id: Number(id) },
    data: {
      amount: Number(data.amount),
      description: data.description,
      date: data.date,
      image,
      updatedAt: new Date(),
      user: { connect: { id: userId } },
    },
  });

  return transaction;
};

/*
|--------------------------------------------------------------------------
| Delete History (Soft Delete)
|--------------------------------------------------------------------------
*/
export const deleteHistory = async (id) => {
  const transaction = await prisma.transactionHistory.findUnique({
    where: { id: Number(id) },
  });

  if (!transaction) throw new Error("Transaction not found");

  await prisma.transactionHistory.update({
    where: { id: Number(id) },
    data: { isActive: false },
  });

  return true;
};

/*
|--------------------------------------------------------------------------
| Archive Transaction
|--------------------------------------------------------------------------
*/
export const archiveTransaction = async (type, id) => {
  switch (type) {
    case "expense":
      await validateExpense(id);
      break;
    case "income":
      await validateIncome(id);
      break;
    case "transfer":
      await validateTransfers(id);
      break;
  }

  const modelMap = {
    expense: prisma.expense,
    income: prisma.income,
    transfer: prisma.transfer,
  };

  const model = modelMap[type];

  await model.update({
    where: { id: Number(id) },
    data: { isActive: false },
  });

  await prisma.transactionHistory.updateMany({
    where: {
      ...(type === "expense" && { expenseId: Number(id) }),
      ...(type === "income" && { incomeId: Number(id) }),
      ...(type === "transfer" && { transferId: Number(id) }),
    },
    data: { isActive: false },
  });
};


export const getDueTransactions = async (userId) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        isActive: true,
        status: {
          not: "Completed",
        },
      },
      include: {
        category: true,
        asset: true,
      },
    });

    return expenses.sort((a, b) => {
      const priority = {
        overdue: 1,
        partial: 2,
        pending: 3,
      };

      return (
        (priority[a.status?.toLowerCase()] ?? 99) -
        (priority[b.status?.toLowerCase()] ?? 99) ||
        new Date(a.date) - new Date(b.date)
      );
    });
  } catch (err) {
    console.error("getDueTransactions error:", err);
    throw new Error("Internal server error");
  }
};

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/