import { Router } from "express";
import multer from "multer";

import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  createRecurringSchema,
  createTransferSchema,
  updateTransferSchema,
} from "../schema/transaction.js";

import {
  getGraph,
  getTransfers,
  postTransfer,
  updateTransfer,
} from "../controllers/transfers.controller.js";

import {
  getRecurring,
  postRecurring,
} from "../controllers/recurring.controller.js";

const router = Router();
const upload = multer();

/* ---------------- TRANSFERS ---------------- */
router
  .route("/")
  .get(requireAuth, catchAsync(getTransfers))
  .post(
    requireAuth,
    upload.single("image"),
    validate({ body: createTransferSchema }),
    catchAsync(postTransfer),
  );

router
  .route("/:id")
  .put(
    requireAuth,
    upload.single("image"),
    validate({ params: idParams, body: updateTransferSchema }),
    catchAsync(updateTransfer),
  );

router
  .route("/graph")
  .get(requireAuth, catchAsync(getGraph));

/* ---------------- RECURRING ---------------- */
router
  .route("/recurring")
  .post(requireAuth, validate({ body: createRecurringSchema }), catchAsync(postRecurring))
  .get(requireAuth, catchAsync(getRecurring));

export default router;