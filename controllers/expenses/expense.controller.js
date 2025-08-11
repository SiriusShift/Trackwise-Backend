const { PrismaClient } = require("@prisma/client");
// const { skip } = require("@prisma/client/runtime/library");
const prisma = new PrismaClient();
const moment = require("moment");
const {
  uploadBase64ToS3,
  uploadFileToS3,
  deleteFileFromS3,
} = require("../../services/s3.service");
const {
  getExpenses,
  postExpense,
  updateExpense,
} = require("../../services/expense/expense.service");

const getExpensesController = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await getExpenses(req.user.id, req.query);

    return res.status(200).json({
      success: true,
      message: "Expenses fetched successfully",
      ...result,
    });
  } catch (error) {
    console.error("Error while fetching expenses:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const postExpenseController = async (req, res, next) => {
  try {
    const expense = await postExpense(req.user.id, req.body, req.file);
    // Respond with success message
    res.status(200).json({
      success: true,
      message: "Expense created successfully",
      data: expense,
    });
  } catch (err) {
    console.error("Error while creating expense", err);

    res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

const updateExpenseController = async (req, res, next) => {
  try {
    console.log("params",req.params?.id)
    const updatedExpense = await updateExpense(req.user.id, req.body, req.file, req.params?.id);
    console.log(updatedExpense)
    res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      data: updatedExpense,
    });
  } catch (err) {
    console.log("Error while updating expense", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

const deleteExpenseController = async (req, res, next) => {
  const { id } = req.params;
  try {
    const data = await prisma.expense.findFirst({
      where: { id: parseInt(id) },
    });

    if (!data) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // If the expense is a recurring parent
    if (data.isRecurring) {
      console.log("Recurring Expense:", data);

      // Mark the parent expense as deleted
      await prisma.expense.update({
        where: { id: parseInt(id) },
        data: { isDeleted: true },
      });

      if (data.status === "Paid") {
        // Update all linked recurring expenses
        await prisma.expense.updateMany({
          where: { recurringExpenseId: parseInt(id) },
          data: { isDeleted: true },
        });

        // Update transaction history for ALL linked expenses
        await prisma.transactionHistory.updateMany({
          where: { expenseId: parseInt(id) },
          data: { isDeleted: true },
        });

        // Also update transaction history for all child expenses
        await prisma.transactionHistory.updateMany({
          where: {
            expenseId: {
              in: (
                await prisma.expense.findMany({
                  where: { recurringExpenseId: parseInt(id) },
                  select: { id: true },
                })
              ).map((expense) => expense.id),
            },
          },
          data: { isDeleted: true },
        });
      }
    }
    // If it's a child expense in a recurring series
    else if (data.recurringExpenseId !== null && !data.isRecurring) {
      console.log("Child of Recurring Expense:", data);

      if (data.status === "Paid") {
        // Delete all expenses tied to the recurringExpenseId
        await prisma.expense.updateMany({
          where: { recurringExpenseId: parseInt(data.recurringExpenseId) },
          data: { isDeleted: true },
        });

        // Delete transaction history for all related expenses
        await prisma.transactionHistory.updateMany({
          where: { expenseId: parseInt(id) },
          data: { isDeleted: true },
        });

        // Also update transaction history for all child expenses
        await prisma.transactionHistory.updateMany({
          where: {
            expenseId: {
              in: (
                await prisma.expense.findMany({
                  where: {
                    recurringExpenseId: parseInt(data.recurringExpenseId),
                  },
                  select: { id: true },
                })
              ).map((expense) => expense.id),
            },
          },
          data: { isDeleted: true },
        });
      } else {
        await prisma.expense.update({
          where: { id: parseInt(id) },
          data: { isDeleted: true },
        });

        await prisma.transactionHistory.updateMany({
          where: { expenseId: parseInt(id) },
          data: { isDeleted: true },
        });
      }
    }
    // If it's a standalone expense
    else {
      console.log("Regular Expense:", data);

      await prisma.expense.update({
        where: { id: parseInt(id) },
        data: { isDeleted: true },
      });

      await prisma.transactionHistory.updateMany({
        where: { expenseId: parseInt(id) },
        data: { isDeleted: true },
      });
    }

    res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (err) {
    console.error("Error while deleting expense:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Expense Graph
const getDetailedExpenses = async (req, res, next) => {
  const { startDate, endDate, mode } = req.query;

  try {
    const filters = {
      userId: parseInt(req.user.id),
      date: {
        gte: startDate,
        lte: endDate,
      },
      isDeleted: false,
    };
    console.log("filters", filters);
    const groupedExpenses = await prisma.$queryRawUnsafe(
      `SELECT 
        date_trunc('${mode}', "date") AS "${mode}",
        sum(amount) AS total
      FROM "Expense"
      WHERE "date" >= '${startDate}'::timestamp AND "date" <= '${endDate}'::timestamp AND "isDeleted" = false
      GROUP BY "${mode}", "amount"
      ORDER BY "${mode}"`
    );
    console.log(groupedExpenses);
    // const groupedExpenses = await prisma.expense.groupBy({
    //   where: {
    //     userId: parseInt(req.user.id),
    //     isDeleted: false,
    //     date: {
    //       gte: (() => {
    //         const date = start;
    //         date.setMonth(date.getMonth() - 1); // Subtract 1 month
    //         return date;
    //       })(),
    //       lte: end,
    //     },
    //   },
    //   _sum: { amount: true },
    // });
    console.log("group expense!", groupedExpenses);

    const trend = (
      ((groupedExpenses[1]?._sum?.amount - groupedExpenses[0]?._sum?.amount) /
        groupedExpenses[0]?._sum?.amount) *
      100
    ).toFixed(2);

    const categoryExpenses = await prisma.expense.groupBy({
      by: ["categoryId"],
      where: filters,
      _sum: { amount: true },
    });

    const detailedCategoryExpenses = await Promise.all(
      categoryExpenses.map(async (item) => {
        const category = await prisma.categories.findFirst({
          where: { id: item.categoryId },
        });
        return {
          categoryId: item.categoryId,
          categoryName: category?.name || "Unknown",
          total: item._sum.amount || 0,
        };
      })
    );

    const totalExpense = await prisma.expense.aggregate({
      where: filters,
      _sum: { amount: true },
    });

    return res.status(200).json({
      success: true,
      message: "Detailed expenses fetched successfully",
      data: {
        trend,
        categoryExpenses: detailedCategoryExpenses,
        totalExpense: totalExpense._sum.amount || 0,
      },
    });
  } catch (err) {
    console.error("Error while fetching detailed expenses:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

module.exports = {
  postExpenseController,
  getExpensesController,
  deleteExpenseController,
  updateExpenseController,
  getDetailedExpenses,
};
