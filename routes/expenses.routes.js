import { Router } from "express";
import multer from "multer";

import catchAsync from "../utils/catchAsync.js";

import {
  postExpense,
  getExpenses,
  payExpense,
  updateExpense,
  getGraph,
  // archiveExpense,
  getBills,
} from "../controllers/expenses.controller.js";

// import {
//   postInstallmentController,
//   getInstallmentController,
// } from "../controllers/installments.controller.js";

import {
  postRecurring,
  getRecurring,
  cancelRecurring,
  confirmRecurring,
} from "../controllers/recurring.controller.js";

import { isLoggedIn } from "../middleware/validate.js";

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
  .post(isLoggedIn, upload.single("image"), catchAsync(postExpense))
  .get(isLoggedIn, catchAsync(getExpenses));

// Update expense
router
  .route("/:id")
  .put(isLoggedIn, upload.single("image"), catchAsync(updateExpense));

// Graph data
router.route("/graph").get(isLoggedIn, catchAsync(getGraph));

// Pay expense
router
  .route("/pay/:id")
  .patch(isLoggedIn, upload.single("image"), catchAsync(confirmRecurring));





/*
|--------------------------------------------------------------------------
| Installments (Imported but NOT used yet)
|--------------------------------------------------------------------------
| ⚠️ You imported these but didn't mount routes.
| If needed, you should add endpoints below.
*/

/*
router.route("/installments")
  .post(isLoggedIn, catchAsync(postInstallmentController))
  .get(isLoggedIn, catchAsync(getInstallmentController));
*/

export default router;