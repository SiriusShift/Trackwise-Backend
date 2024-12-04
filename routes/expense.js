const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {postExpense} = require("../controllers/expenses");
const { isLoggedIn } = require("../middleware/validate");
const router = Router();

router.route("/create").post(isLoggedIn, catchAsync(postExpense));

module.exports = router