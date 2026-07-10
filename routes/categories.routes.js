import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  createCategory,
  getAllCategory,
} from "../controllers/categories.controller.js";

import {
  addExpenseLimit,
  deleteExpenseLimit,
  getAllExpenseLimit,
  updateExpenseLimit,
} from "../controllers/limits.controller.js";

import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Category Routes
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .post(requireAuth, catchAsync(createCategory))
  .get(requireAuth, catchAsync(getAllCategory));

/*
|--------------------------------------------------------------------------
| Expense Limit Routes
|--------------------------------------------------------------------------
*/

router
  .route("/limits")
  .post(requireAuth, catchAsync(addExpenseLimit))
  .get(requireAuth, catchAsync(getAllExpenseLimit));

router
  .route("/limits/:id")
  .patch(requireAuth, catchAsync(updateExpenseLimit))
  .delete(requireAuth, catchAsync(deleteExpenseLimit));

export default router;