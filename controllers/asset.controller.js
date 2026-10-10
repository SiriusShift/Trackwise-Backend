import { asyncHandler } from "../middleware/asyncHandler.js";
import * as assetService from "../services/assets.service.js";


/* ---------------- CREATE ASSET ---------------- */
export const createAsset = asyncHandler(async (req, res) => {
  const { name, balance, type, sub_type, currency, color, includeNetWorth, creditDetail } = req.body;

  const response = await assetService.createAsset(
    name,
    balance, currency,
    type, sub_type, color,
    req.user.id, includeNetWorth, creditDetail
  );

  return res.status(200).json({
    success: true,
    message: "Asset created successfully",
    data: response,
  });

});

/* ---------------- UPDATE ASSET ---------------- */
export const updateAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, color, institution, includeNetWorth, creditDetail } = req.body;

  const response = await assetService.updateAsset(req.user.id, id, {
    name,
    color,
    institution,
    includeNetWorth,
    creditDetail,
  });

  return res.status(200).json({
    success: true,
    message: "Asset updated successfully",
    data: response,
  });
});

/* ---------------- GET ASSET ---------------- */
export const getAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;

  const response = await assetService.getAsset(req.user.id, id, dateFrom, dateTo);

  return res.status(200).json({
    success: true,
    message: "Asset fetched successfully with total expenses and incomes",
    ...response,
  });
});

/* ---------------- ARCHIVE ASSET ---------------- */
export const archiveAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const archived = req.body?.archived ?? true;

  const response = await assetService.archiveAsset(req.user.id, id, archived);

  return res.status(200).json({
    success: true,
    message: archived
      ? "Asset archived successfully"
      : "Asset restored successfully",
    data: response,
  });
});