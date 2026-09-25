import { Router } from "express";
import multer from "multer";

import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  createIncomeSchema,
  updateIncomeSchema,
} from "../schema/transaction.js";

import {
  getGraph,
  getIncome,
  postIncome,
  updateIncome
} from "../controllers/incomes.controller.js";

import {
  confirmRecurring
} from "../controllers/recurring.controller.js";

const router = Router();
const upload = multer();

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
  .get(requireAuth, catchAsync(getGraph));

router
  .route("/receive/:id")
  .patch(
    requireAuth,
    upload.single("image"),
    validate({ params: idParams }),
    catchAsync(confirmRecurring),
  );

export default router;