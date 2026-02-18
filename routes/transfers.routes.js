const { Router } = require("express");
const { isLoggedIn } = require("../middleware/validate");
const catchAsync = require("../utils/catchAsync");
// const { postIncome, getIncome, getGraph, updateIncome, collectIncome } = require("../controllers/incomes.controller");
const {postRecurring, getRecurring, transactRecurring} = require("../controllers/recurring.controller")
const multer = require("multer");
const { getTransfers, transfer, updateTransfer, postTransfer, getGraph } = require("../controllers/transfers.controller");

const router = Router();
const upload = multer();

router.route("/").get(isLoggedIn, catchAsync(getTransfers));
router
  .route("/")
  .post(isLoggedIn, upload.single("image"), catchAsync(postTransfer));
// Update and delete transfer
router.route("/:id").patch(isLoggedIn, upload.single("image"), catchAsync(updateTransfer))
router.route("/graph").get(isLoggedIn, catchAsync(getGraph))
router
  .route("/transfer/:id")
  .patch(isLoggedIn, upload.single("image"), catchAsync(transfer));
router.route("/receive/auto/:id").post(isLoggedIn, catchAsync(transactRecurring))
//recurring
router.route("/recurring").post(isLoggedIn, catchAsync(postRecurring))
router.route("/recurring").get(isLoggedIn, catchAsync(getRecurring))

module.exports = router;
