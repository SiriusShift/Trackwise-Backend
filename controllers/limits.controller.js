import { prisma } from "../config/prisma.js"

export const addExpenseLimit = async (req, res, next) => {
  try {
    const { amount, categoryId } = req.body;
    console.log(amount);
    const expenseLimit = await prisma.categoryTracker.findFirst({
      where: {
        category: {
          id: categoryId,
        },
        user: {
          id: parseInt(req.user.id),
        },
        isActive: true,
      },
    });
    if (expenseLimit) {
      return res.status(400).json({
        success: false,
        message: "Expense limit already exists for this category",
      });
    }
    await prisma.categoryTracker.create({
      data: {
        limit: amount,
        category: {
          connect: {
            id: categoryId,
          },
        },
        user: {
          connect: {
            id: parseInt(req.user.id),
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Expense limit added successfully",
    });
  } catch (err) {
    console.error("Error while fetching expenses", err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

export const getAllExpenseLimit = async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  try {
    const categoryTracker = await prisma.categoryTracker.findMany({
      where: {
        user: {
          id: parseInt(req.user.id),
        },
        isActive: true,
        limit: { not: null },
      },
      select: {
        id: true,
        limit: true,
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
            expenses: {
              where: {
                isActive: true,
                userId: parseInt(req.user.id),
              },
              select: {
                id: true,
                description: true,
                amount: true,
                description: true,
                date: true
              },
            },
          },
        },
      },
    });

    // Calculate total expenses per category
    console.log(categoryTracker, "category!");
    const result = categoryTracker.map(({ id, category, limit }) => {
      const totalExpense =
        category?.expenses?.reduce((expenseAcc, expense) => {
          return expenseAcc + expense.amount;
        }, 0) || 0;

      return {
        id,
        category,
        value: Number(limit),
        total: totalExpense,
      };
    });

    console.log(result);

    res.status(200).json({
      success: true,
      message: "Expense limit fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error while fetching expenses", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

export const updateExpenseLimit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    console.log("amount", amount);
    await prisma.categoryTracker.update({
      where: {
        id: parseInt(id),
      },
      data: {
        limit: amount,
      },
    });
    res.status(200).json({
      success: true,
      message: "Expense limit updated successfully",
    });
  } catch (err) {
    console.error("Error while fetching expenses", err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

export const deleteExpenseLimit = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Expense limit not found",
      });
    }
    await prisma.categoryTracker.update({
      where: {
        id: parseInt(id),
      },
      data: {
        isActive: false,
      },
    });
    res.status(200).json({
      success: true,
      message: "Expense limit deleted successfully",
    });
  } catch (err) {
    console.error("Error while fetching expenses", err);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};