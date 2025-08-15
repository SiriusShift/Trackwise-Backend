const { Router } = require("express");
const { isLoggedIn } = require("../middleware/validate");
const catchAsync = require("../utils/catchAsync");
const { postIncome } = require("../controllers/incomes.controller");
const router = Router();

router.route("/").get(isLoggedIn, catchAsync())
router.route("/").post(isLoggedIn, catchAsync(postIncome))