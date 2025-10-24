const { Router } = require("express");
const { getHistory, editHistory } = require("../controllers/transactions.controller");
const IncomeRouter = require("./incomes.routes");
const ExpenseRouter = require("./expenses.routes");
const { isLoggedIn } = require("../middleware/validate");
const catchAsync = require("../utils/catchAsync");
const multer = require("multer");

const router = Router();
const upload = multer(); // For text-only formData, or configure for file uploads

router.route("/history").get(isLoggedIn, catchAsync(getHistory));
router.route("/edit/:id").patch(isLoggedIn, upload.single("image"), catchAsync(editHistory))

//Child routes
router.use("/income", IncomeRouter);
router.use("/expense", ExpenseRouter);

module.exports = router