const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {
    isLoggedIn,
    validateCreateRequest,
    checkPermissionLevel,
    validateUserUpdateRequest,
  } = require("../middleware/validate");
  
const { register, verifyEmail, sendEmailCode } = require("../controllers/user");
 
const router = Router();

router.route("/").post(validateCreateRequest("user"), catchAsync(register));
router.route("/verify").post(catchAsync(verifyEmail))
router.route("/email-code").post(catchAsync(sendEmailCode));

module.exports = router