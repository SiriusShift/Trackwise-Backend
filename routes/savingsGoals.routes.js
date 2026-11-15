import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  contributeSavings,
  createSavingsGoal,
  deleteSavingsGoal,
  getGoalContributions,
  getSavingsGoals,
  updateSavingsGoal,
  withdrawSavings,
} from "../controllers/savingsGoals.controller.js";

import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  contributeSavingsSchema,
  createSavingsGoalSchema,
  getGoalContributionsQuery,
  getSavingsGoalsQuery,
  updateSavingsGoalSchema,
  withdrawSavingsSchema,
} from "../schema/savingsGoal.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Savings Goal Routes
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .post(
    requireAuth,
    validate({ body: createSavingsGoalSchema }),
    catchAsync(createSavingsGoal),
  )
  .get(
    requireAuth,
    validate({ query: getSavingsGoalsQuery }),
    catchAsync(getSavingsGoals),
  );

router
  .route("/:id")
  .patch(
    requireAuth,
    validate({ params: idParams, body: updateSavingsGoalSchema }),
    catchAsync(updateSavingsGoal),
  )
  .delete(
    requireAuth,
    validate({ params: idParams }),
    catchAsync(deleteSavingsGoal),
  );

router.get(
  "/:id/contributions",
  requireAuth,
  validate({ params: idParams, query: getGoalContributionsQuery }),
  catchAsync(getGoalContributions),
);

router.post(
  "/:id/contribute",
  requireAuth,
  validate({ params: idParams, body: contributeSavingsSchema }),
  catchAsync(contributeSavings),
);

router.post(
  "/:id/withdraw",
  requireAuth,
  validate({ params: idParams, body: withdrawSavingsSchema }),
  catchAsync(withdrawSavings),
);

export default router;
