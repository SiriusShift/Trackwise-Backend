const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const {
  createAsset,
  getAssetRemainingBalance,
} = require("../controllers/asset");
const { isLoggedIn, validateCreateRequest } = require("../middleware/validate");
const router = Router();

router.route("/create").post(isLoggedIn, catchAsync(createAsset));
router.route("/get").get(isLoggedIn, catchAsync(getAssetRemainingBalance));

module.exports = router;
