const { Router } = require("express");
const { getHistory, editHistory, deleteHistory, getStatistics } = require("../controllers/transactions.controller");
const IncomeRouter = require("./incomes.routes");
const ExpenseRouter = require("./expenses.routes");
const TransferRouter = require("./transfers.routes");

const { isLoggedIn } = require("../middleware/validate");
const catchAsync = require("../utils/catchAsync");
const multer = require("multer");

const router = Router();
const upload = multer(); // For text-only formData, or configure for file uploads

router.route("/history").get(isLoggedIn, catchAsync(getHistory));
router.route("/edit/:id").patch(isLoggedIn, upload.single("image"), catchAsync(editHistory))
router.route("/delete/:id").patch(isLoggedIn, catchAsync(deleteHistory))
router.route("/statistics").get(isLoggedIn, catchAsync(getStatistics))
//Child routes
router.use("/income", IncomeRouter);
router.use("/expense", ExpenseRouter);
router.use("/transfer", TransferRouter)

module.exports = router