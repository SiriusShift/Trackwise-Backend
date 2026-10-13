import { Router } from "express";
import { upload } from "../middleware/upload.js";

import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  createIncomeSchema,
  graphQuery,
  updateIncomeSchema,
} from "../schema/transaction.js";

import {
  getGraph,
  getIncome,
  postIncome,
  updateIncome
} from "../controllers/incomes.controller.js";

const router = Router();

/* ---------------- INCOME ---------------- */
router
  .route("/")
  .get(requireAuth, catchAsync(getIncome))
  .post(
    requireAuth,
    upload.single("image"),
    validate({ body: createIncomeSchema }),
    catchAsync(postIncome),
  );

router
  .route("/:id")
  .put(
    requireAuth,
    upload.single("image"),
    validate({ params: idParams, body: updateIncomeSchema }),
    catchAsync(updateIncome),
  );

router
  .route("/graph")
  .get(requireAuth, validate({ query: graphQuery }), catchAsync(getGraph));

export default router;