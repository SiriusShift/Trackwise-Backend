import { Router } from "express";
import multer from "multer";

import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";
import { validate } from "../middleware/validate.js";
import { idParams } from "../schema/common.js";
import {
  createRecurringSchema,
  createTransferSchema,
  transferPaymentSchema,
  updateTransferSchema,
} from "../schema/transaction.js";

import {
  getGraph,
  getTransfers,
  postTransfer,
  transfer,
  updateTransfer,
} from "../controllers/transfers.controller.js";

import {
  confirmRecurring,
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

router
  .route("/transfer/:id")
  .patch(
    requireAuth,
    upload.single("image"),
    validate({ params: idParams, body: transferPaymentSchema }),
    catchAsync(transfer),
  );

/* ---------------- RECURRING ---------------- */
router
  .route("/receive/auto/:id")
  .post(requireAuth, validate({ params: idParams }), catchAsync(confirmRecurring));

router
  .route("/recurring")
  .post(requireAuth, validate({ body: createRecurringSchema }), catchAsync(postRecurring))
  .get(requireAuth, catchAsync(getRecurring));

export default router;