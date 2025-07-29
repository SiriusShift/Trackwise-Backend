const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {
  postExpense,
  getExpenses,
  deleteExpense,
  getDetailedExpenses,
  updateExpense,
} = require("../controllers/expense.controller");
const { isLoggedIn } = require("../middleware/validate");
const multer = require("multer");
const upload = multer(); // For text-only formData, or configure for file uploads

const router = Router();

router
  .route("/createExpense")
  .post(isLoggedIn, upload.single("image"), catchAsync(postExpense));
router
  .route("/updateExpense/:id")
  .patch(isLoggedIn, upload.single("image"), catchAsync(updateExpense));
router.route("/getExpense").get(isLoggedIn, catchAsync(getExpenses));
router.route("/deleteExpense/:id").patch(isLoggedIn, catchAsync(deleteExpense));
router
  .route("/getDetailedExpenses")
  .get(isLoggedIn, catchAsync(getDetailedExpenses));

module.exports = router;
