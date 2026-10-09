import { Router } from "express";

import {
  archiveTransaction,
  getHistory,
  getStatistics
} from "../controllers/transactions.controller.js";
import catchAsync from "../utils/catchAsync.js";

import ExpenseRouter from "./expenses.routes.js";
import IncomeRouter from "./incomes.routes.js";
import SchedulesRouter from "./schedules.routes.js";
import TransferRouter from "./transfers.routes.js";

import { cancelRecurring, editRecurring, getRecurring, postRecurring } from "../controllers/recurring.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  archiveTransactionQuery,
  createRecurringSchema,
} from "../schema/transaction.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Multer Setup
|--------------------------------------------------------------------------
| Using memory storage for form-data (no files persisted to disk)
*/

/*
|--------------------------------------------------------------------------
| Transaction Routes
|--------------------------------------------------------------------------
*/

router.route("/history").get(requireAuth, catchAsync(getHistory));

router.route("/statistics").get(requireAuth, catchAsync(getStatistics));

// Mounted before "/:id" so "schedules" isn't captured as a transaction id.
router.use("/schedules", SchedulesRouter);

router
  .route("/:id")
  .patch(
    requireAuth,
    validate({ params: idParams, query: archiveTransactionQuery }),
    catchAsync(archiveTransaction),
  );
// router.route("/due").get(requireAuth, catchAsync(dueTransactions))

/*
|--------------------------------------------------------------------------
| Recurring Routes
|--------------------------------------------------------------------------
*/

router
  .route("/recurring")
  .post(requireAuth, validate({ body: createRecurringSchema }), catchAsync(postRecurring))
  .get(requireAuth, catchAsync(getRecurring));

router
  .route("/recurring/:id")
  .patch(requireAuth, validate({ params: idParams }), catchAsync(cancelRecurring))
  .put(requireAuth, validate({ params: idParams, body: createRecurringSchema }), catchAsync(editRecurring));

/*
|--------------------------------------------------------------------------
| Child Routes
|--------------------------------------------------------------------------
*/

router.use("/income", IncomeRouter);
router.use("/expense", ExpenseRouter);
router.use("/transfer", TransferRouter);

export default router;