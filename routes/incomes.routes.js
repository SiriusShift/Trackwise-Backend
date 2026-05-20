import { Router } from "express";
import multer from "multer";

import { isLoggedIn } from "../middleware/validate.js";
import catchAsync from "../utils/catchAsync.js";

import {
  postIncome,
  getIncome,
  getGraph,
  updateIncome,
  collectIncome,
} from "../controllers/incomes.controller.js";

import {
  postRecurring,
  getRecurring,
  transactRecurring,
} from "../controllers/recurring.controller.js";

const router = Router();
const upload = multer();

/* ---------------- INCOME ---------------- */
router
  .route("/")
  .get(isLoggedIn, catchAsync(getIncome))
  .post(isLoggedIn, upload.single("image"), catchAsync(postIncome));

router
  .route("/:id")
  .put(isLoggedIn, upload.single("image"), catchAsync(updateIncome));

router
  .route("/graph")
  .get(isLoggedIn, catchAsync(getGraph));

router
  .route("/receive/:id")
  .patch(isLoggedIn, upload.single("image"), catchAsync(collectIncome));

router
  .route("/receive/auto/:id")
  .post(isLoggedIn, catchAsync(transactRecurring));

/* ---------------- RECURRING ---------------- */
router
  .route("/recurring")
  .post(isLoggedIn, catchAsync(postRecurring))
  .get(isLoggedIn, catchAsync(getRecurring));

export default router;