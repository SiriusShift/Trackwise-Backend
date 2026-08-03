import { Router } from "express";
import { getTransactionStatement } from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";

const router = Router();


router.route("/statement").get(requireAuth, catchAsync(getTransactionStatement))

export default router;