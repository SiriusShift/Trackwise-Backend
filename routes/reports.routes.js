import { Router } from "express";
import { getMoneyFlowStatement, getTransactionStatement } from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";

const router = Router();


router.route("/statement").get(requireAuth, catchAsync(getTransactionStatement))
router.route("/money-flow").get(requireAuth, catchAsync(getMoneyFlowStatement))

export default router;