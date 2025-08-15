const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const addExpenseLimit = async (req, res, next) => {
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

const getAllExpenseLimit = async (req, res, next) => {
  const { startDate, endDate } = req.query;
  try {
    const categoryTracker = await prisma.categoryTracker.findMany({
      where: {
        user: {
          id: parseInt(req.user.id),
          isActive: true,
        },
        category: {
          type: "Expense",
        },
        isActive: true,
        limit: { not: null }, // Filter categories that have a limit
      },
      select: {
        id: true,
        limit: true,
        userId: true,
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
            expenses: {
              where: {
                date: {
                  gte: startDate,
                  lte: endDate,
                },
                isActive: true,
                // isRecurring: false,
                userId: parseInt(req.user.id),
              },
              select: {
                amount: true,
              },
            },
          },
        },
      },
      orderBy: {
        category: {
          name: "asc",
        },
      },
    });
    console.log("test: ", categoryTracker);
    // const categories = await prisma.categoryTracker.findMany({
    //   where: {
    //     user: {
    //       id: parseInt(req.user.id),
    //     },
    //     limit: { not: null }, // Filter categories that have a limit
    //   },
    //   select: {
    //     id: true,
    //     name: true,
    //     icon: true,
    //     limit: true,
    //     expenses: {
    //       where: {
    //         date: {
    //           gte: new Date(startDate),
    //           lte: new Date(endDate),
    //         },
    //         userId: parseInt(req.user.id),
    //       },
    //       select: {
    //         amount: true,
    //       },
    //     },
    //   },
    // });

    // Calculate total expenses per category
    const result = categoryTracker.map((category) => {
      console.log("Category Tracker : ", category);
      const totalExpense = category.category.expenses.reduce(
        (sum, expense) => sum + expense.amount,
        0
      );
      return {
        id: category.id,
        category: category.category,
        value: category.limit,
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

const updateExpenseLimit = async (req, res, next) => {
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

const deleteExpenseLimit = async (req, res, next) => {
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

module.exports = {
  addExpenseLimit,
  getAllExpenseLimit,
  updateExpenseLimit,
  deleteExpenseLimit,
};
