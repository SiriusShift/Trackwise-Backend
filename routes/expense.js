const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {postExpense, getExpenses, postRecurringExpense, getRecurringExpenses, deleteExpense} = require("../controllers/expenses");
const { isLoggedIn } = require("../middleware/validate");
const router = Router();

router.route("/create").post(isLoggedIn, catchAsync(postExpense));
router.route("/get").get(isLoggedIn, catchAsync(getExpenses));
router.route("/createRecurring").post(isLoggedIn, catchAsync(postRecurringExpense));
router.route("/getRecurring").get(isLoggedIn, catchAsync(getRecurringExpenses));
router.route("/deleteExpense/:id").patch(isLoggedIn, catchAsync(deleteExpense));


module.exports = router