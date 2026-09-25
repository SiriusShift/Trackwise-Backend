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
  skipBillPayment,
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
  billPaymentSchema,
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

// Pay expense
router
  .route("/bills/:id/pay")
  .post(
    requireAuth,
    validate({ params: idParams, body: billPaymentSchema }),
    catchAsync(postBillPayment),
  );

router
  .route("/bills/:id/skip")
  .patch(requireAuth, validate({ params: idParams }), catchAsync(skipBillPayment));

router
  .route("/bills")
  .get(requireAuth, catchAsync(getBills));

router
  .route("/bills/:id")
  .get(requireAuth, catchAsync(getBill));

router
  .route("/bills/:id/history")
  .get(requireAuth, catchAsync(getBillPayments));



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