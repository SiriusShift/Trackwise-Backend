const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const { createAsset } = require("../controllers/asset");
const {
    isLoggedIn,
    validateCreateRequest,
  } = require("../middleware/validate");
const router = Router();

router.route("/create").post(catchAsync(createAsset))

module.exports = router