const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {postExpense, getExpenses} = require("../controllers/expenses");
const { isLoggedIn } = require("../middleware/validate");
const router = Router();

router.route("/create").post(isLoggedIn, catchAsync(postExpense));
router.route("/get").get(isLoggedIn, catchAsync(getExpenses));


module.exports = router