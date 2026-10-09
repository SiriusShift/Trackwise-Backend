import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  getCreditStatementSchedule,
  getRecurringSchedule,
  getRecurringScheduleHistory,
  getSchedules,
  payCreditStatement,
  payRecurringSchedule,
  skipRecurringSchedule,
} from "../controllers/schedules.controller.js";

import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  getSchedulesQuery,
  payCreditStatementSchema,
  payScheduleSchema,
} from "../schema/transaction.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Scheduled Transactions (mounted at /transactions/schedules)
|--------------------------------------------------------------------------
| Replaces /transactions/expense/bills. Covers recurring Expense / Income /
| Transfer schedules and credit card statements.
*/

router.route("/").get(requireAuth, validate({ query: getSchedulesQuery }), catchAsync(getSchedules));

/* ---------------- Recurring ---------------- */
router
  .route("/recurring/:id")
  .get(requireAuth, validate({ params: idParams }), catchAsync(getRecurringSchedule));

router
  .route("/recurring/:id/history")
  .get(requireAuth, validate({ params: idParams }), catchAsync(getRecurringScheduleHistory));

router
  .route("/recurring/:id/pay")
  .post(
    requireAuth,
    validate({ params: idParams, body: payScheduleSchema }),
    catchAsync(payRecurringSchedule),
  );

router
  .route("/recurring/:id/skip")
  .patch(requireAuth, validate({ params: idParams }), catchAsync(skipRecurringSchedule));

/* ---------------- Credit statements ---------------- */
router
  .route("/credit/:id")
  .get(requireAuth, validate({ params: idParams }), catchAsync(getCreditStatementSchedule));

router
  .route("/credit/:id/pay")
  .post(
    requireAuth,
    validate({ params: idParams, body: payCreditStatementSchema }),
    catchAsync(payCreditStatement),
  );

export default router;
