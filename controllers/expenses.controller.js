import { asyncHandler } from "../middleware/asyncHandler.js";
import * as expenseService from "../services/expenses.service.js";

/* ---------------- GET EXPENSES ---------------- */
export const getExpenses = asyncHandler(async (req, res) => {
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
});

/* ---------------- CREATE EXPENSE ---------------- */
export const postExpense = asyncHandler(async (req, res) => {
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
});

/* ---------------- UPDATE EXPENSE ---------------- */
export const updateExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;

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

});

/* ---------------- PAY EXPENSE ---------------- */
export const payExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;

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
});

/* ---------------- EXPENSE GRAPH ---------------- */
export const getGraph = asyncHandler(async (req, res) => {

  const response = await expenseService.getGraph(
    req.user.id,
    req.query
  );

  return res.status(200).json({
    success: true,
    message: "Detailed expenses fetched successfully",
    data: response,
  });
});
