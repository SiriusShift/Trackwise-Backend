import { asyncHandler } from "../middleware/asyncHandler.js";
import * as schedulesService from "../services/schedules.service.js";

/* ---------------- LIST ---------------- */
export const getSchedules = asyncHandler(async (req, res) => {
  const response = await schedulesService.getSchedules(req.user.id, req.query);

  return res.status(200).json({
    success: true,
    message: "Scheduled transactions fetched successfully",
    data: response,
  });
});

/* ---------------- RECURRING ---------------- */
export const getRecurringSchedule = asyncHandler(async (req, res) => {
  const response = await schedulesService.getRecurringSchedule(req.user.id, req.params.id);

  return res.status(200).json({
    success: true,
    message: "Scheduled transaction fetched successfully",
    data: response,
  });
});

export const getRecurringScheduleHistory = asyncHandler(async (req, res) => {
  const response = await schedulesService.getRecurringScheduleHistory(req.user.id, req.params.id);

  return res.status(200).json({
    success: true,
    message: "Schedule history fetched successfully",
    data: response,
  });
});

export const payRecurringSchedule = asyncHandler(async (req, res) => {
  const response = await schedulesService.payRecurringSchedule(req.user.id, req.params.id, req.body);

  return res.status(200).json({
    success: true,
    message: "Scheduled transaction recorded successfully",
    data: response,
  });
});

export const skipRecurringSchedule = asyncHandler(async (req, res) => {
  const response = await schedulesService.skipRecurringSchedule(req.user.id, req.params.id);

  return res.status(200).json({
    success: true,
    message: "Scheduled transaction skipped successfully",
    data: response,
  });
});

/* ---------------- CREDIT STATEMENTS ---------------- */
export const getCreditStatementSchedule = asyncHandler(async (req, res) => {
  const response = await schedulesService.getCreditStatementSchedule(req.user.id, req.params.id);

  return res.status(200).json({
    success: true,
    message: "Credit statement fetched successfully",
    data: response,
  });
});

export const payCreditStatement = asyncHandler(async (req, res) => {
  const response = await schedulesService.payCreditStatement(req.user.id, req.params.id, req.body);

  return res.status(200).json({
    success: true,
    message: "Credit statement payment recorded successfully",
    data: response,
  });
});
