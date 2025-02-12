const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {postExpense, getExpenses, postRecurringExpense, getRecurringExpenses, deleteExpense, getDetailedExpenses, updateExpense, postPayRecurring} = require("../controllers/expenses");
const { isLoggedIn } = require("../middleware/validate");
const router = Router();

router.route("/create").post(isLoggedIn, catchAsync(postExpense));
router.route("/get").get(isLoggedIn, catchAsync(getExpenses));
router.route("/createRecurring").post(isLoggedIn, catchAsync(postRecurringExpense));
router.route("/getRecurring").get(isLoggedIn, catchAsync(getRecurringExpenses));
router.route("/deleteExpense/:id").patch(isLoggedIn, catchAsync(deleteExpense));
router.route("/getDetailedExpenses").get(isLoggedIn, catchAsync(getDetailedExpenses));
router.route("/updateExpense/:id").patch(isLoggedIn, catchAsync(updateExpense));
router.route("/postRecurringPayment/:id").post(isLoggedIn, catchAsync(postPayRecurring));

module.exports = router