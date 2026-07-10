import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as assetService from "../services/assets.service.js";

const prisma = new PrismaClient();

/* ---------------- CREATE ASSET ---------------- */
export const createAsset = asyncHandler(async (req, res) => {
  const { name, balance, type, currency, creditLimit, color, icon } = req.body;

  const response = await assetService.createAsset(
    name,
    balance, currency,
    type, creditLimit, color, icon,
    req.user.id
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

  const response = await assetService.getAsset(
    req.user.id,
    id
  );

  return res.status(200).json({
    success: true,
    message: "Assets fetched successfully with total expenses and incomes",
    ...response,
  });

});