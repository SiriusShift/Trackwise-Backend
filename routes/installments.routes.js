const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {postInstallmentController, getInstallmentController} = require("../controllers/installments.controller")
const { isLoggedIn } = require("../middleware/validate");
const multer = require("multer");

const router = Router();


//Installment
// router.route("/createInstallment").post(isLoggedIn, catchAsync(postInstallmentController))
// router.route("/getInstallment").get(isLoggedIn, catchAsync(getInstallmentController))

module.exports = router;
