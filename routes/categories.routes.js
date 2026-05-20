import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  createCategory,
  getAllCategory,
} from "../controllers/categories.controller.js";

import {
  addExpenseLimit,
  getAllExpenseLimit,
  updateExpenseLimit,
  deleteExpenseLimit,
} from "../controllers/limits.controller.js";

import { isLoggedIn } from "../middleware/validate.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Category Routes
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .post(isLoggedIn, catchAsync(createCategory))
  .get(isLoggedIn, catchAsync(getAllCategory));

/*
|--------------------------------------------------------------------------
| Expense Limit Routes
|--------------------------------------------------------------------------
*/

router
  .route("/limits")
  .post(isLoggedIn, catchAsync(addExpenseLimit))
  .get(isLoggedIn, catchAsync(getAllExpenseLimit));

router
  .route("/limits/:id")
  .patch(isLoggedIn, catchAsync(updateExpenseLimit))
  .delete(isLoggedIn, catchAsync(deleteExpenseLimit));

export default router;