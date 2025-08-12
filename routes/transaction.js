const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {
  postExpenseController,
  getExpensesController,
  deleteExpenseController,
  updateExpenseController,
  getDetailedExpenses,
} = require("../controllers/expenses/expense.controller");
const {postInstallmentController, getInstallmentController} = require("../controllers/expenses/installment.controller")
const { isLoggedIn } = require("../middleware/validate");
const multer = require("multer");
const upload = multer(); // For text-only formData, or configure for file uploads

const router = Router();

// Expense
router
  .route("/createExpense")
  .post(isLoggedIn, upload.single("image"), catchAsync(postExpenseController));
router
  .route("/updateExpense/:id")
  .patch(
    isLoggedIn,
    upload.single("image"),
    catchAsync(updateExpenseController)
  );
router.route("/getExpense").get(isLoggedIn, catchAsync(getExpensesController));
router
  .route("/deleteExpense/:id")
  .patch(isLoggedIn, catchAsync(deleteExpenseController));
router
  .route("/getDetailedExpenses")
  .get(isLoggedIn, catchAsync(getDetailedExpenses));

//Installment
router.route("/createInstallment").post(isLoggedIn, catchAsync(postInstallmentController))
router.route("/getInstallment").get(isLoggedIn, catchAsync(getInstallmentController))

module.exports = router;
