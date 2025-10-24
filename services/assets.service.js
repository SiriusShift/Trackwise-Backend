const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const moment = require("moment");
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
      ...(id && { id: id }),
    },
    select: {
      id: true,
      name: true,
      balance: true,
      receivedTransactionHistory: true,
      sentTransactionHistory: true,
    },
  });

  const assetsLastMonth = await prisma.asset.findMany({
    where: {
      userId: userId, // Assuming `req.user.id` represents the logged-in user
    },
    select: {
      id: true,
      name: true,
      balance: true,
      receivedTransactionHistory: true,
      sentTransactionHistory: true,
    },
  });

  console.log("assets", assets);
  console.log("assets prev", assetsLastMonth);

  const lastMonthData = assetsLastMonth.map((asset) => {
    const totalExpenses = asset.sentTransactionHistory.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );

    console.log("total expense", totalExpenses)
    const totalIncomes = asset.receivedTransactionHistory.reduce(
      (sum, income) => sum + Number(income.amount),
      0
    );
    const remainingBalance = Number(asset.balance) + Number(totalIncomes) - Number(totalExpenses);

    return {
      ...asset,
      totalExpenses,
      totalIncomes,
      remainingBalance,
    };
  });

  const data = assets.map((asset) => {
    const totalExpenses = asset.sentTransactionHistory.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );
    const totalIncomes = asset.receivedTransactionHistory.reduce(
      (sum, income) => sum + Number(income.amount),
      0
    );
    const remainingBalance = Number(asset.balance) + Number(totalIncomes) - Number(totalExpenses);

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
  getAsset,
};
