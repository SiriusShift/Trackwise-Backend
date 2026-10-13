import { asyncHandler } from "../middleware/asyncHandler.js";
import * as limitsService from "../services/limits.service.js";

export const addExpenseLimit = asyncHandler(async (req, res) => {
  await limitsService.addExpenseLimit(req.user.id, req.body);

  res.status(200).json({
    success: true,
    message: "Expense limit added successfully",
  });
});

export const getAllExpenseLimit = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const data = await limitsService.getAllExpenseLimit(
    req.user.id,
    startDate,
    endDate,
  );

  res.status(200).json({
    success: true,
    message: "Expense limit fetched successfully",
    data,
  });
});

export const updateExpenseLimit = asyncHandler(async (req, res) => {
  await limitsService.updateExpenseLimit(
    req.user.id,
    req.params.id,
    req.body.amount,
  );

  res.status(200).json({
    success: true,
    message: "Expense limit updated successfully",
  });
});

export const deleteExpenseLimit = asyncHandler(async (req, res) => {
  await limitsService.deleteExpenseLimit(req.user.id, req.params.id);

  res.status(200).json({
    success: true,
    message: "Expense limit deleted successfully",
  });
});
