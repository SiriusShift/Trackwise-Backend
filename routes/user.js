const { Router } = require("express");
const catchAsync = require("../utils/catchAsync");
const passport = require("passport");

const {
  validateCreateRequest,
  validateUserUpdateRequest,
} = require("../middleware/validate");

const {
  register,
  resetPassword,
  login,
  isAuthenticated,
  logout,
} = require("../controllers/user");

const router = Router();
// routes/user.js
/**
 * @swagger
 * /sign-up:
 *   post:
 *     summary: Register a new user
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *             required:
 *               - username
 *               - password
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad request
 */
router
  .route("/sign-up")
  .post(validateCreateRequest("user"), catchAsync(register));

/**
 * @swagger
 * /sign-in:
 *   post:
 *     summary: Log in with credentials
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *             required:
 *               - username
 *               - password
 *     responses:
 *       200:
 *         description: User logged in successfully
 *       401:
 *         description: Unauthorized
 */
router.route("/sign-in").post(
  catchAsync(async (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res
          .status(401)
          .json({ message: info.message || "Unauthorized" });
      }
      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }
        return login(req, res, next);
      });
    })(req, res, next);
  })
);

/**
 * @swagger
 * /reset-password:
 *   post:
 *     summary: Reset user password
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPassword:
 *                 type: string
 *             required:
 *               - newPassword
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid input
 */
router
  .route("/reset-password")
  .post(validateUserUpdateRequest("password"), catchAsync(resetPassword));

/**
 * @swagger
 * /auth-status:
 *   get:
 *     summary: Check if the user is authenticated
 *     tags: [User]
 *     responses:
 *       200:
 *         description: User is authenticated
 *       401:
 *         description: User is not authenticated
 */
router.route("/auth-status").get(isAuthenticated);

/**
 * @swagger
 * /sign-out:
 *   get:
 *     summary: Log out the current user
 *     tags: [User]
 *     responses:
 *       200:
 *         description: User logged out successfully
 *       400:
 *         description: Logout failed
 */
router.route("/sign-out").get(logout);

module.exports = router;
