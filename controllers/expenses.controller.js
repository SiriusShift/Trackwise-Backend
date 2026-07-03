import * as expenseService from "../services/expenses.service.js";
import * as recurringService from "../services/recurring.service.js";

/* ---------------- GET EXPENSES ---------------- */
export const getExpenses = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await expenseService.getExpenses(
      req.user.id,
      req.query
    );

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

/* ---------------- CREATE EXPENSE ---------------- */
export const postExpense = async (req, res) => {
  try {
    const expense = await expenseService.postExpense(
      req.user.id,
      req.body,
      req.file,
    );

    return res.status(200).json({
      success: true,
      message: "Expense created successfully",
      data: expense,
    });
  } catch (error) {
    console.error("Error while creating expense:", error);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

/* ---------------- UPDATE EXPENSE ---------------- */
export const updateExpense = async (req, res) => {
  const { id } = req.params;

  try {
    const updatedExpense = await expenseService.updateExpense(
      req.user.id,
      req.body,
      req.file,
      id
    );

    return res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      data: updatedExpense,
    });
  } catch (error) {
    console.error("Error while updating expense:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/* ---------------- PAY EXPENSE ---------------- */
export const payExpense = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await expenseService.postPayment(
      req.user.id,
      req.body,
      id,
      req.file
    );

    return res.status(200).json({
      success: true,
      message: "Payment successful",
      data: response,
    });
  } catch (error) {
    console.error("Error while processing payment:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/* ---------------- EXPENSE GRAPH ---------------- */
export const getGraph = async (req, res) => {
  try {
    const response = await expenseService.getGraph(
      req.user.id,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Detailed expenses fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error("Error while fetching expense graph:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/* ---------------- GET BILLS ---------------- */
export const getBills = async (req, res) => {
  try {
    const response = await expenseService.getScheduledExpenses(req.user.id, req.query);

    return res.status(200).json({
      success: true,
      message: "Bills fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error("Error while fetching bills:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getBill = async (req, res) => {
  const { id } = req.params;
  try {
    const response = await expenseService.getScheduledExpense(req.user.id, id);

    return res.status(200).json({
      success: true,
      message: "Bill fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error("Error while fetching bills:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getBillPayments = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await expenseService.getBillPayments(id);

    console.log('bills', response)
    return res.status(200).json({
      success: true,
      message: "Bill payment history fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error("Error while fetching bills:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const postBillPayment = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await expenseService.postExpense(
      req.user.id,
      req.body,
      null,
      id
    );
    await recurringService.transactBill(id)
    return res.status(200).json({
      success: true,
      message: "Bill paid successfully",
      data: response,
    });
  } catch (error) {
    console.error("Error while fetching bills:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};