import { asyncHandler } from "../middleware/asyncHandler.js";
import * as categoryService from "../services/categories.service.js";

export const createCategory = asyncHandler(async (req, res) => {
  const { admin } = req.query
  const result = await categoryService.createCategory(req.user.id, req.body, admin);

  res.status(201).json({
    success: true,
    message: "Categories created successfully",
    count: result.count,
  });
});

export const getAllCategory = asyncHandler(async (req, res, next) => {
  const { type } = req.query;

  const category = await categoryService.getCategories(req.user.id, type);
  res.status(200).json({
    success: true,
    message: "Category fetched successfully",
    data: category,
  });
});