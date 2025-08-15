const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
  
const { verifyEmail, sendEmailCode, forgotPassword } = require("../controllers/emails.controller");
 
const router = Router();

router.route("/verify").post(catchAsync(verifyEmail))
router.route("/email-code").post(catchAsync(sendEmailCode));
router.route("/forgot-password").post(catchAsync(forgotPassword));

module.exports = router