import { Router } from "express";
import multer from "multer";

import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";

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
  .post(requireAuth, upload.single("image"), catchAsync(postTransfer));

router
  .route("/:id")
  .put(requireAuth, upload.single("image"), catchAsync(updateTransfer));

router
  .route("/graph")
  .get(requireAuth, catchAsync(getGraph));

router
  .route("/transfer/:id")
  .patch(requireAuth, upload.single("image"), catchAsync(transfer));

/* ---------------- RECURRING ---------------- */
router
  .route("/receive/auto/:id")
  .post(requireAuth, catchAsync(confirmRecurring));

router
  .route("/recurring")
  .post(requireAuth, catchAsync(postRecurring))
  .get(requireAuth, catchAsync(getRecurring));

export default router;