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
    let updateExpense;
    console.log(req.body);

    //IF DELETING (soft delete)
    if (req.body.delete) {
      updateExpense = await expenseService.deleteExpense(req.user.id, id);
    } else {
      // update only
      updateExpense = await expenseService.updateExpense(
        req.user.id,
        req.body,
        req.file,
        id
      );
    }
    res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      data: updateExpense,
    });
  } catch (err) {
    console.log("Error while updating expense", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

const payExpense = async (req, res, next) => {
  const { id } = req.params;
  try {
    const response = expenseService.postPayment(
      req.user.id,
      req.body,
      id,
      req.file
    );
    res.status(200).json({
      message: "Payment successful",
      success: true,
      data: response,
    });
  } catch (err) {
    console.log("Error while updating expense", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// Expense Graph
const getGraph = async (req, res, next) => {
  try {
    const response = await expenseService.getExpenseGraph(
      req.user.id,
      req.query
    );
    console.log("response!: ", response);

    return res.status(200).json({
      success: true,
      message: "Detailed expenses fetched successfully",
      data: response,
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
  updateExpense,
  getGraph,
  payExpense,
};
