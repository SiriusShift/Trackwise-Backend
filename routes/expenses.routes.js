const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {
  postExpense,
  getExpenses,
  deleteExpense,
  updateExpense,
  getGraph,
} = require("../controllers/expenses.controller");
const {postInstallmentController, getInstallmentController} = require("../controllers/installments.controller")
const { isLoggedIn } = require("../middleware/validate");
const multer = require("multer");
const upload = multer(); // For text-only formData, or configure for file uploads

const router = Router();

// Expense
router
  .route("/")
  .post(isLoggedIn, upload.single("image"), catchAsync(postExpense));
//UPDATE AND DELETE
router
  .route("/:id")
  .patch(
    isLoggedIn,
    upload.single("image"),
    catchAsync(updateExpense)
  );
router.route("/").get(isLoggedIn, catchAsync(getExpenses));
router
  .route("/graph")
  .get(isLoggedIn, catchAsync(getGraph));

module.exports = router;
