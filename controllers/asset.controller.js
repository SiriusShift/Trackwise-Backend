const { PrismaClient } = require("@prisma/client");
const { TripleDES } = require("crypto-js");
const prisma = new PrismaClient();
const moment = require("moment");
const assetService = require("../services/assets.service");

const createAsset = async (req, res, next) => {
  console.log(req.query);
  const { name, balance } = req.body;

  const data = await prisma.asset.create({
    data: {
      name,
      balance,
      user: {
        connect: {
          id: req.user.id,
        },
      },
    },
  });
  res.status(200).json({
    success: true,
    message: "Asset created successfully",
    data: data,
  });
};

const getAsset = async (req, res) => {
  const {id} = req.params
  try {
    // Step 1: Fetch all assets along with related expenses and incomes
    const response =  await assetService.getAsset(req.user.id, req.body, id);
    console.log(response, "response")

    // Step 3: Return the response
    res.status(200).json({
      success: true,
      message: "Assets fetched successfully with total expenses and incomes",
      ...response,
    });
  } catch (error) {
    console.error("Error fetching assets, expenses, and incomes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch assets, expenses, and incomes",
      error: error.message,
    });
  }
};

module.exports = {
  createAsset,
  getAsset,
};
