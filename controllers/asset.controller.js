import { PrismaClient } from "@prisma/client";
import moment from "moment";
import * as assetService from "../services/assets.service.js";

const prisma = new PrismaClient();

/* ---------------- CREATE ASSET ---------------- */
export const createAsset = async (req, res) => {
  const { name, balance, type, currency, creditLimit, color, icon } = req.body;

  try {
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
  } catch (error) {
    console.error("Error creating asset", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create asset",
      error: error.message,
    });
  }
};

/* ---------------- GET ASSET ---------------- */
export const getAsset = async (req, res) => {
  const { id } = req.params;

  try {
    const response = await assetService.getAsset(
      req.user.id,
      id
    );

    return res.status(200).json({
      success: true,
      message: "Assets fetched successfully with total expenses and incomes",
      ...response,
    });
  } catch (error) {
    console.error("Error fetching assets:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch assets",
      error: error.message,
    });
  }
};