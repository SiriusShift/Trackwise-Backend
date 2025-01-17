const { PrismaClient } = require("@prisma/client");
const { TripleDES } = require("crypto-js");
const prisma = new PrismaClient();

const createAsset = async (req, res, next) => {
  const { name, balance, user } = req.body;

  const data = await prisma.asset.create({
    data: {
      name,
      balance,
      user: {
        connect: {
          id: user.id,
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
            isDeleted: false,
          },
          select: {
            id: true,
            date: true,
            categoryId: true,
            description: true,
            amount: true,
            sourceId: true,
            recurringExpenseId: true,
            recipient: true,
          },
        },
        incomes: {
          select: {
            id: true,
            date: true,
            categoryId: true,
            description: true,
            amount: true,
            source: true,
            sourceId: true,
            status: true,
            // recurring: true, // Include recurring field if needed
          },
        },
      },
    });

    console.log(assets);

    // Step 2: Calculate total expenses, total incomes, and remaining balance for each asset
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

    // Step 3: Return the response
    res.status(200).json({
      success: true,
      message: "Assets fetched successfully with total expenses and incomes",
      data,
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
