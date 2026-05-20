import { Router } from "express";
import catchAsync from "../utils/catchAsync.js";

import {
  verifyEmail,
  sendEmailCode,
  forgotPassword,
} from "../controllers/emails.controller.js";

const router = Router();

router.route("/verify").post(catchAsync(verifyEmail));
router.route("/email-code").post(catchAsync(sendEmailCode));
router.route("/forgot-password").post(catchAsync(forgotPassword));

export default router;