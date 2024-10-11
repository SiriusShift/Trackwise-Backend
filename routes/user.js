const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {
    isLoggedIn,
    validateCreateRequest,
    checkPermissionLevel,
    validateUserUpdateRequest,
  } = require("../middleware/validate");
  
const { register } = require("../controllers/user");
 
const router = Router();

router.route("/").post(validateCreateRequest("user"), catchAsync(register));

module.exports = router