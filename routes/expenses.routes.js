import { Router } from "express";
import multer from "multer";

import catchAsync from "../utils/catchAsync.js";

import {
  getBill,
  getBillPayments,
  getBills,
  getExpenses,
  getGraph,
  postBillPayment,
  postExpense,
  updateExpense
} from "../controllers/expenses.controller.js";

// import {
//   postInstallmentController,
//   getInstallmentController,
// } from "../controllers/installments.controller.js";


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
  .route("/bills/:id")
  .post(isLoggedIn, catchAsync(postBillPayment));

router
  .route("/bills")
  .get(isLoggedIn, catchAsync(getBills));

router
  .route("/bills/:id")
  .get(isLoggedIn, catchAsync(getBill));

router
  .route("/bills/:id/history")
  .get(isLoggedIn, catchAsync(getBillPayments));



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