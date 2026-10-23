import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  createSavingsGoal,
  deleteSavingsGoal,
  getSavingsGoals,
  updateSavingsGoal,
} from "../controllers/savingsGoals.controller.js";

import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  createSavingsGoalSchema,
  getSavingsGoalsQuery,
  updateSavingsGoalSchema,
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

export default router;
