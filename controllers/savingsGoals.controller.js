import { asyncHandler } from "../middleware/asyncHandler.js";
import * as savingsGoalsService from "../services/savingsGoals.service.js";

export const getSavingsGoals = asyncHandler(async (req, res) => {
  const data = await savingsGoalsService.getSavingsGoals(req.user.id, {
    isActive: req.query.isActive,
  });

  res.status(200).json({
    success: true,
    message: "Savings goals fetched successfully",
    ...data,
  });
});

export const createSavingsGoal = asyncHandler(async (req, res) => {
  const data = await savingsGoalsService.createSavingsGoal(req.user.id, req.body);

  res.status(200).json({
    success: true,
    message: "Savings goal created successfully",
    data,
  });
});

export const updateSavingsGoal = asyncHandler(async (req, res) => {
  const data = await savingsGoalsService.updateSavingsGoal(
    req.user.id,
    req.params.id,
    req.body,
  );

  res.status(200).json({
    success: true,
    message: "Savings goal updated successfully",
    data,
  });
});

export const deleteSavingsGoal = asyncHandler(async (req, res) => {
  await savingsGoalsService.deleteSavingsGoal(req.user.id, req.params.id);

  res.status(200).json({
    success: true,
    message: "Savings goal deleted successfully",
  });
});


export const contributeSavings = asyncHandler(async (req, res) => {
  const data = await savingsGoalsService.contributeSavings(
    req.user.id,
    req.params.id,
    req.body,
  );

  res.status(201).json({
    success: true,
    message: "Contribution added successfully",
    data,
  });
});
