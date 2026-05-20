import { Router } from "express";
import multer from "multer";

import catchAsync from "../utils/catchAsync.js";
import {
  getHistory,
  editHistory,
  deleteHistory,
  getStatistics,
  archiveTransaction,
  dueTransactions,
} from "../controllers/transactions.controller.js";

import IncomeRouter from "./incomes.routes.js";
import ExpenseRouter from "./expenses.routes.js";
import TransferRouter from "./transfers.routes.js";

import { isLoggedIn } from "../middleware/validate.js";

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

router.route("/history").get(isLoggedIn, catchAsync(getHistory));

router
  .route("/edit/:id")
  .patch(isLoggedIn, upload.single("image"), catchAsync(editHistory));

router.route("/delete/:id").patch(isLoggedIn, catchAsync(deleteHistory));

router.route("/statistics").get(isLoggedIn, catchAsync(getStatistics));

router.route("/:id").patch(isLoggedIn, catchAsync(archiveTransaction));
router.route("/due").get(isLoggedIn, catchAsync(dueTransactions))

/*
|--------------------------------------------------------------------------
| Child Routes
|--------------------------------------------------------------------------
*/

router.use("/income", IncomeRouter);
router.use("/expense", ExpenseRouter);
router.use("/transfer", TransferRouter);

export default router;