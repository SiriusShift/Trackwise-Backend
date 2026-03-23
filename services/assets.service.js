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

const getAsset = async (userId, id) => {
  const lastMonth = moment().subtract(1, "months").endOf("month").toDate()
  const asset = await getAssetBalance(userId, id);
  const lastMonthAsset = await  getAssetBalance(userId, id, lastMonth)

  console.log(asset, lastMonthAsset, "asset!")
  const trend = (
    ((asset?.balance - lastMonthAsset?.balance) / lastMonthAsset?.balance) *
    100
  ).toFixed(2);

  return {
    data: asset?.data,
    balance: asset?.balance,
    trend,
  };
};

const getAssetBalance = async (userId, id, date) => {
  try {
    const assets = await prisma.asset.findMany({
      where: {
        userId,
        ...(id && { id }),
      },
      select: {
        id: true,
        name: true,
        balance: true,
        receivedTransactionHistory: {
          where: {
            isActive: true,
            ...(date && {
              date: {
                lte: date
              }
            })
          },
        },
        sentTransactionHistory: {
          where: {
            isActive: true, ...(date && {
              date: {
                lte: date
              }
            })
          },
        },
      },
    });

    const data = assets.map((asset) => {
      const totalExpenses = asset.sentTransactionHistory.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0,
      );
      const totalIncomes = asset.receivedTransactionHistory.reduce(
        (sum, income) => sum + Number(income.amount),
        0,
      );
      const remainingBalance =
        Number(asset.balance) + Number(totalIncomes) - Number(totalExpenses);

      return {
        ...asset,
        totalExpenses,
        totalIncomes,
        remainingBalance,
      };

    });
    const totalRemainingBalance = data.reduce(
      (sum, asset) => sum + asset.remainingBalance,
      0,
    );
    return {
      data,
      balance: totalRemainingBalance
    }
  } catch (err) {
    throw new Error("Internal Server Error");
  }
};

module.exports = {
  validateAsset,
  getAsset,
  getAssetBalance
};
