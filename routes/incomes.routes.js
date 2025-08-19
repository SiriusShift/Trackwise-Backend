const { Router } = require("express");
const { isLoggedIn } = require("../middleware/validate");
const catchAsync = require("../utils/catchAsync");
const { postIncome, getIncome, getGraph, updateIncome } = require("../controllers/incomes.controller");
const multer = require("multer");

const router = Router();
const upload = multer();

router.route("/").get(isLoggedIn, catchAsync(getIncome));
router
  .route("/")
  .post(isLoggedIn, upload.single("image"), catchAsync(postIncome));
router.route("/:id").patch(isLoggedIn, upload.single("image"), catchAsync(updateIncome))
router.route("/graph").get(isLoggedIn, catchAsync(getGraph))

module.exports = router;
