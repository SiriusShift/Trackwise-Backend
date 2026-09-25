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
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  createCategoryQuery,
  createCategorySchema,
  createLimitSchema,
  updateLimitSchema,
} from "../schema/category.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Category Routes
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .post(
    requireAuth,
    validate({ body: createCategorySchema, query: createCategoryQuery }),
    catchAsync(createCategory),
  )
  .get(requireAuth, catchAsync(getAllCategory));

/*
|--------------------------------------------------------------------------
| Expense Limit Routes
|--------------------------------------------------------------------------
*/

router
  .route("/limits")
  .post(requireAuth, validate({ body: createLimitSchema }), catchAsync(addExpenseLimit))
  .get(requireAuth, catchAsync(getAllExpenseLimit));

router
  .route("/limits/:id")
  .patch(
    requireAuth,
    validate({ params: idParams, body: updateLimitSchema }),
    catchAsync(updateExpenseLimit),
  )
  .delete(requireAuth, validate({ params: idParams }), catchAsync(deleteExpenseLimit));

export default router;