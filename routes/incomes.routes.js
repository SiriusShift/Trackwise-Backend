const { Router } = require("express");
const { isLoggedIn } = require("../middleware/validate");
const catchAsync = require("../utils/catchAsync");
const { postIncome, getIncome, getGraph, updateIncome } = require("../controllers/incomes.controller");
const {postRecurring, getRecurring} = require("../controllers/recurring.controller")
const multer = require("multer");

const router = Router();
const upload = multer();

router.route("/").get(isLoggedIn, catchAsync(getIncome));
router
  .route("/")
  .post(isLoggedIn, upload.single("image"), catchAsync(postIncome));
// Update and delete income
router.route("/:id").patch(isLoggedIn, upload.single("image"), catchAsync(updateIncome))
router.route("/graph").get(isLoggedIn, catchAsync(getGraph))
//recurring
router.route("/recurring").post(isLoggedIn, catchAsync(postRecurring))
router.route("/recurring").get(isLoggedIn, catchAsync(getRecurring))

module.exports = router;
