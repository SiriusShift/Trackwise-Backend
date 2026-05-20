import { Router } from "express";
import multer from "multer";

import { isLoggedIn } from "../middleware/validate.js";
import catchAsync from "../utils/catchAsync.js";

import {
  getTransfers,
  updateTransfer,
  postTransfer,
  getGraph,
  transfer,
} from "../controllers/transfers.controller.js";

import {
  postRecurring,
  getRecurring,
  transactRecurring,
} from "../controllers/recurring.controller.js";

const router = Router();
const upload = multer();

/* ---------------- TRANSFERS ---------------- */
router
  .route("/")
  .get(isLoggedIn, catchAsync(getTransfers))
  .post(isLoggedIn, upload.single("image"), catchAsync(postTransfer));

router
  .route("/:id")
  .put(isLoggedIn, upload.single("image"), catchAsync(updateTransfer));

router
  .route("/graph")
  .get(isLoggedIn, catchAsync(getGraph));

router
  .route("/transfer/:id")
  .patch(isLoggedIn, upload.single("image"), catchAsync(transfer));

/* ---------------- RECURRING ---------------- */
router
  .route("/receive/auto/:id")
  .post(isLoggedIn, catchAsync(transactRecurring));

router
  .route("/recurring")
  .post(isLoggedIn, catchAsync(postRecurring))
  .get(isLoggedIn, catchAsync(getRecurring));

export default router;