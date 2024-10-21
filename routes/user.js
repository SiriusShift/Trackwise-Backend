const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const passport = require('passport');

const {
    isLoggedIn,
    validateCreateRequest,
    checkPermissionLevel,
    validateUserUpdateRequest,
  } = require("../middleware/validate");
  
const { register, verifyEmail, login } = require("../controllers/user");
 
const router = Router();
router.route("/sign-up").post(validateCreateRequest("user"), catchAsync(register));
router.route("/sign-in").post(passport.authenticate("local")
, catchAsync(login));

module.exports = router