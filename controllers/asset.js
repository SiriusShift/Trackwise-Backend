const { PrismaClient } = require("@prisma/client");
const { TripleDES } = require("crypto-js");
const prisma = new PrismaClient();
const moment = require("moment");

const createAsset = async (req, res, next) => {
  console.log(req.query);
  const { name, balance } = req.body;

  const data = await prisma.asset.create({
    data: {
      name,
      balance,
      user: {
        connect: {
          id: req.user.id,
        },
      },
    },
  });
  res.status(200).json({
    success: true,
    message: "Asset created successfully",
    data: data,
  });
};

const getAssetRemainingBalance = async (req, res) => {
  try {
    // Step 1: Fetch all assets along with related expenses and incomes
    const assets = await prisma.asset.findMany({
      where: {
        userId: req.user.id, // Assuming `req.user.id` represents the logged-in user
      },
      select: {
        id: true,
        name: true,
        balance: true,
        expenses: {
          where: {
            isActive: true,
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
        },
      },
    });

    const assetsLastMonth = await prisma.asset.findMany({
      where: {
        userId: req.user.id, // Assuming `req.user.id` represents the logged-in user
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

    console.log(assetsLastMonth);

    console.log(assets);

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

    // Step 3: Return the response
    res.status(200).json({
      success: true,
      message: "Assets fetched successfully with total expenses and incomes",
      data,
      balance: totalRemainingBalance,
      trend,
    });
  } catch (error) {
    console.error("Error fetching assets, expenses, and incomes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch assets, expenses, and incomes",
      error: error.message,
    });
  }
};

module.exports = {
  createAsset,
  getAssetRemainingBalance,
};
