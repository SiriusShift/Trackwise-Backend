const { PrismaClient } = require("@prisma/client");
// const { skip } = require("@prisma/client/runtime/library");
const prisma = new PrismaClient();
const moment = require("moment");
const {
  uploadBase64ToS3,
  uploadFileToS3,
  deleteFileFromS3,
} = require("../services/s3.service");
const expenseService = require("../services/expenses.service");

const getExpenses = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await expenseService.getExpenses(req.user.id, req.query);

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

const postExpense = async (req, res, next) => {
  try {
    const expense = await expenseService.postExpense(
      req.user.id,
      req.body,
      req.file
    );
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

const updateExpense = async (req, res, next) => {
  const { id } = req.params;
  try {
    console.log("params", req.params?.id);
    const updatedExpense = await expenseService.updateExpense(
      req.user.id,
      req.body,
      req.file,
      id
    );
    console.log(updatedExpense);
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

const deleteExpense = async (req, res, next) => {
  const { id } = req.params;
  try {
    expenseService.deleteExpense(req.user.id,id)
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
      isActive: true,
    };
    console.log("filters", filters);
    const groupedExpenses = await prisma.$queryRawUnsafe(
      `SELECT 
        date_trunc('${mode}', "date") AS "${mode}",
        sum(amount) AS total
      FROM "Expense"
      WHERE "date" >= '${startDate}'::timestamp AND "date" <= '${endDate}'::timestamp AND "isActive" = true
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
  postExpense,
  getExpenses,
  deleteExpense,
  updateExpense,
  getDetailedExpenses,
};
