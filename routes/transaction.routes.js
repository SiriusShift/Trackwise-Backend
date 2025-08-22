const { Router } = require("express");
const { getHistory } = require("../controllers/transactions.controller");
const IncomeRouter = require("./incomes.routes");
const ExpenseRouter = require("./expenses.routes");
const { isLoggedIn } = require("../middleware/validate");
const catchAsync = require("../utils/catchAsync");

const router = Router();

router.route("/history").get(isLoggedIn, catchAsync(getHistory));

//Child routes
router.use("/income", IncomeRouter);
router.use("/expense", ExpenseRouter);

module.exports = router