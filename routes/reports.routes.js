import { Router } from "express";
import {
    getCreditCardStatement,
    getCreditStatementList,
    getMoneyFlowStatement,
    getTransactionStatement,
} from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";

const router = Router();


router.route("/statement").get(requireAuth, catchAsync(getTransactionStatement))
router.route("/money-flow").get(requireAuth, catchAsync(getMoneyFlowStatement))
router.route("/credit-statements").get(requireAuth, catchAsync(getCreditStatementList))
router.route("/credit-statement").get(requireAuth, catchAsync(getCreditCardStatement))

export default router;