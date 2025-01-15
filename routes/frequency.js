const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const { createFrequency, getAllFrequency } = require("../controllers/frequency");
const { isLoggedIn } = require("../middleware/validate");
const router = Router();

router.route("/create").post(isLoggedIn, catchAsync(createFrequency));
router.route("/get").get(isLoggedIn, catchAsync(getAllFrequency));

module.exports = router;