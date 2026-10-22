import { Router } from "express";
import { scanReceipt } from "../controllers/ai.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { scanImageLimiter } from "../middleware/rateLimit.js";
import { upload } from "../middleware/upload.js";
import catchAsync from "../utils/catchAsync.js";

const router = Router();

router
  .route("/scan-receipt")
  .post(requireAuth, scanImageLimiter, upload.single("image"), catchAsync(scanReceipt));

export default router;
