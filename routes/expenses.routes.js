const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {
  postExpense,
  getExpenses,
  payExpense,
  updateExpense,
  getGraph,
} = require("../controllers/expenses.controller");
const {
  postInstallmentController,
  getInstallmentController,
} = require("../controllers/installments.controller");
const { isLoggedIn } = require("../middleware/validate");
const multer = require("multer");
const {
  postRecurring,
  getRecurring,
  transactRecurring,
  cancelRecurring,
} = require("../controllers/recurring.controller");
const upload = multer(); // For text-only formData, or configure for file uploads

const router = Router();

// Expense
router
  .route("/")
  .post(isLoggedIn, upload.single("image"), catchAsync(postExpense));
  router.route("/").get(isLoggedIn, catchAsync(getExpenses));

//UPDATE AND DELETE
router
  .route("/:id")
  .patch(isLoggedIn, upload.single("image"), catchAsync(updateExpense));
router.route("/graph").get(isLoggedIn, catchAsync(getGraph));
router
  .route("/pay/:id")
  .patch(isLoggedIn, upload.single("image"), catchAsync(payExpense));
router.route("/pay/auto/:id").post(isLoggedIn, catchAsync(transactRecurring))
//Recurring
router.route("/recurring").post(isLoggedIn, catchAsync(postRecurring));
router.route("/recurring").get(isLoggedIn, catchAsync(getRecurring));
router.route("/recurring/:id").patch(isLoggedIn, catchAsync(cancelRecurring))
module.exports = router;
