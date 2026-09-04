import { Router } from "express";
import { getTransactionStatement } from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";

const router = Router();


router.route("/").get(requireAuth, catchAsync(getTransactionStatement))
router.route("/").patch(requireAuth, catchAsync(getTransactionStatement))

export default router;