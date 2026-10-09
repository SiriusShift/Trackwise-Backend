import { Router } from "express";
import multer from "multer";

import catchAsync from "../utils/catchAsync.js";

import {
  getExpenses,
  getGraph,
  postExpense,
  updateExpense
} from "../controllers/expenses.controller.js";

// import {
//   postInstallmentController,
//   getInstallmentController,
// } from "../controllers/installments.controller.js";


import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  createExpenseSchema,
  updateExpenseSchema,
} from "../schema/transaction.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Multer Setup
|--------------------------------------------------------------------------
*/
const upload = multer();

/*
|--------------------------------------------------------------------------
| Expense Routes
|--------------------------------------------------------------------------
*/

// Create expense
router
  .route("/")
  .post(
    requireAuth,
    upload.single("image"),
    validate({ body: createExpenseSchema }),
    catchAsync(postExpense),
  )
  .get(requireAuth, catchAsync(getExpenses));

// Update expense
router
  .route("/:id")
  .put(
    requireAuth,
    upload.single("image"),
    validate({ params: idParams, body: updateExpenseSchema }),
    catchAsync(updateExpense),
  );

// Graph data
router.route("/graph").get(requireAuth, catchAsync(getGraph));

// Bills moved to /transactions/schedules (routes/schedules.routes.js)

/*
|--------------------------------------------------------------------------
| Installments (Imported but NOT used yet)
|--------------------------------------------------------------------------
| ⚠️ You imported these but didn't mount routes.
| If needed, you should add endpoints below.
*/

/*
router.route("/installments")
  .post(requireAuth, catchAsync(postInstallmentController))
  .get(requireAuth, catchAsync(getInstallmentController));
*/

export default router;