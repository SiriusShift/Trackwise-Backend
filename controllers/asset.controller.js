import { asyncHandler } from "../middleware/asyncHandler.js";
import * as assetService from "../services/assets.service.js";


/* ---------------- CREATE ASSET ---------------- */
export const createAsset = asyncHandler(async (req, res) => {
  const { name, balance, type, sub_type, currency, creditLimit, color, icon, includeNetWorth } = req.body;

  const response = await assetService.createAsset(
    name,
    balance, currency,
    type, sub_type, creditLimit, color, icon,
    req.user.id, includeNetWorth
  );

  return res.status(200).json({
    success: true,
    message: "Asset created successfully",
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