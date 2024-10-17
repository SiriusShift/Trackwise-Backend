const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
  
const { verifyEmail, sendEmailCode } = require("../controllers/user");
 
const router = Router();

router.route("/verify").post(catchAsync(verifyEmail))
router.route("/email-code").post(sendEmailCode);

module.exports = router