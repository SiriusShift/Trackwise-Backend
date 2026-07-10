import { Router } from "express";
import multer from "multer";

import {
  archiveTransaction,
  deleteHistory,
  editHistory,
  getHistory,
  getStatistics
} from "../controllers/transactions.controller.js";
import catchAsync from "../utils/catchAsync.js";

import ExpenseRouter from "./expenses.routes.js";
import IncomeRouter from "./incomes.routes.js";
import TransferRouter from "./transfers.routes.js";

import { cancelRecurring, confirmRecurring, editRecurring, getRecurring, postRecurring } from "../controllers/recurring.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Multer Setup
|--------------------------------------------------------------------------
| Using memory storage for form-data (no files persisted to disk)
*/
const upload = multer();

/*
|--------------------------------------------------------------------------
| Transaction Routes
|--------------------------------------------------------------------------
*/

router.route("/history").get(requireAuth, catchAsync(getHistory));

router
  .route("/edit/:id")
  .patch(requireAuth, upload.single("image"), catchAsync(editHistory));

router.route("/delete/:id").patch(requireAuth, catchAsync(deleteHistory));

router.route("/statistics").get(requireAuth, catchAsync(getStatistics));

router.route("/:id").patch(requireAuth, catchAsync(archiveTransaction));
// router.route("/due").get(requireAuth, catchAsync(dueTransactions))

/*
|--------------------------------------------------------------------------
| Recurring Routes
|--------------------------------------------------------------------------
*/

router
  .route("/recurring")
  .post(requireAuth, catchAsync(postRecurring))
  .get(requireAuth, catchAsync(getRecurring));

router
  .route("/recurring/:id")
  .patch(requireAuth, catchAsync(cancelRecurring))
  .put(requireAuth, catchAsync(editRecurring));

router
  .route("/recurring/:id/confirm")
  .post(requireAuth, catchAsync(confirmRecurring));
/*
|--------------------------------------------------------------------------
| Child Routes
|--------------------------------------------------------------------------
*/

router.use("/income", IncomeRouter);
router.use("/expense", ExpenseRouter);
router.use("/transfer", TransferRouter);

export default router;