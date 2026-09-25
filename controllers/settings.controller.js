import { asyncHandler } from "../middleware/asyncHandler.js";
import * as settingsService from "../services/settings.service.js";

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings(req.user.id);

  res.status(200).json({
    success: true,
    message: "Settings fetched successfully",
    data: settings,
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.user.id, req.body);

  res.status(200).json({
    success: true,
    message: "Settings updated successfully",
    data: settings,
  });
});
