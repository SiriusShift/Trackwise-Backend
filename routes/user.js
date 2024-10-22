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
router.route("/sign-in").post(
  catchAsync(async (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        // If there's an error, pass it to the next middleware
        return next(err);
      }
      if (!user) {
        // If authentication failed, send a custom error response
        return res.status(401).json({ message: info.message || "Unauthorized" });
      }
      // Log in the user using req.logIn, which establishes a session
      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }
        // Successful authentication, send a response
        return login(req,res,next)
      });
    })(req, res, next); // Pass req, res, next to the passport.authenticate call
  })
);

module.exports = router