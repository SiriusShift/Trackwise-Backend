const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {postExpenses} = require("../controllers/expenses");
const { isLoggedIn } = require("../middleware/validate");
const router = Router();

router.route("/create").post(isLoggedIn, catchAsync(postExpenses));

module.exports = router