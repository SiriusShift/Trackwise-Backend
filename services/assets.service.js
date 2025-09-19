const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const moment = require("moment")
const validateAsset = async (assetId, userId) => {
  console.log("assetID", assetId);

  const category = await prisma.asset.findFirst({
    where: {
      id: assetId,
      userId: userId,
    },
  });

  if (!category) {
    throw new Error("Asset not found"); // ❌ Throw error here
  }
  return category;
};

const getAsset = async (userId, assetData, id) => {
  const assets = await prisma.asset.findMany({
    where: {
      userId: userId, // Assuming `req.user.id` represents the logged-in user
      ...(id && {id: id})
    },
    select: {
      id: true,
      name: true,
      balance: true,
      expenses: {
        where: {
          isActive: true,
          status: "Paid",
        },
      },
      incomes: {
        select: {
          id: true,
          date: true,
          categoryId: true,
          description: true,
          amount: true,
          assetId: true,
          status: true,
          // recurring: true, // Include recurring field if needed
        },
        where: {
          isActive: true,
          status: "Received",
        },
      },
    },
  });

  const assetsLastMonth = await prisma.asset.findMany({
    where: {
      userId:userId, // Assuming `req.user.id` represents the logged-in user
    },
    select: {
      id: true,
      name: true,
      balance: true,
      expenses: {
        where: {
          isActive: true,
          date: {
            lte: moment().subtract(1, "month").endOf("month").toDate(),
          },
        },
      },
      incomes: {
        select: {
          id: true,
          date: true,
          categoryId: true,
          description: true,
          amount: true,
          assetId: true,
          status: true,
        },
        where: {
          isActive: true,
          date: {
            lte: moment().subtract(1, "month").endOf("month").toDate(),
          },
        },
      },
    },
  });

  const lastMonthData = assetsLastMonth.map((asset) => {
    const totalExpenses = asset.expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );
    const totalIncomes = asset.incomes.reduce(
      (sum, income) => sum + income.amount,
      0
    );
    const remainingBalance = asset.balance + totalIncomes - totalExpenses;

    return {
      ...asset,
      totalExpenses,
      totalIncomes,
      remainingBalance,
    };
  });

  const data = assets.map((asset) => {
    const totalExpenses = asset.expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0
    );
    const totalIncomes = asset.incomes.reduce(
      (sum, income) => sum + income.amount,
      0
    );
    const remainingBalance = asset.balance + totalIncomes - totalExpenses;

    return {
      ...asset,
      totalExpenses,
      totalIncomes,
      remainingBalance,
    };
  });

  const totalRemainingBalance = data.reduce(
    (sum, asset) => sum + asset.remainingBalance,
    0
  );

  const previousTotalBalance = lastMonthData.reduce(
    (sum, asset) => sum + asset.remainingBalance,
    0
  );

  console.log(totalRemainingBalance, previousTotalBalance);

  const trend = (
    ((totalRemainingBalance - previousTotalBalance) / previousTotalBalance) *
    100
  ).toFixed(2);

  return {
    data,
    balance: totalRemainingBalance,
    trend,
  };
};

module.exports = {
  validateAsset,
  getAsset
};
