import { Router } from "express";
import passport from "passport";
import catchAsync from "../utils/catchAsync.js";

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import {
  validateCreateRequest,
  validateUserUpdateRequest,
} from "../middleware/validate.js";

import {
  forgotPassword,
  isAuthenticated,
  login,
  logout,
  register,
  resetPassword,
  sendEmailCode,
  verifyEmail,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router
  .route("/sign-up")
  .post(validateCreateRequest("user"), catchAsync(register));

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

        return login(req, res, next, user);
      });
    })(req, res, next);
  })
);

router
  .route("/reset-password")
  .post(validateUserUpdateRequest("password"), catchAsync(resetPassword));

router.route("/auth-status").get(requireAuth, isAuthenticated);

router.route("/sign-out").get(logout);

// Sign-In with Google
router.get(
  "/auth/google/sign-in",
  passport.authenticate("google-sign-in", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/sign-in",
  passport.authenticate("google-sign-in", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/sign-in/callback",
  // Handle authentication response and error explicitly
  (req, res, next) => {
    passport.authenticate("google-sign-in", (err, user, info) => {

      console.log("test", err);
      if (err) {
        // If there’s an error (for example, database issue, network issue, etc.)
        console.error("Authentication error:", err);
        return res.status(500).json({ message: "Internal server error" });
      }

      if (!user) {
        // Redirect to login page with specific message if user is not authenticated
        return res.redirect(`${process.env.CLIENT_URL}/sign-in?error=true&message=${encodeURIComponent(info.message || "Unauthorized")}`);
      }

      req.logIn(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return next(err);
        }

        // Optionally redirect after successful login
        res.redirect(`${process.env.CLIENT_URL}/`);
      });
    })(req, res, next);
  }
);

// Sign-Up with Google
router.get(
  "/auth/google/sign-up",
  passport.authenticate("google-sign-up", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/sign-up/callback",
  (req, res, next) => {
    passport.authenticate("google-sign-up", (err, profile, info) => {
      if (err) {
        console.error("Authentication error:", err);
        return res.redirect(
          `${process.env.CLIENT_URL}/sign-up?error=true&message=Internal server error`
        );
      }

      if (!profile) {
        return res.redirect(
          `${process.env.CLIENT_URL}/sign-in?error=true&message=${encodeURIComponent(
            info?.message || "Unauthorized"
          )}`
        );
      }

      console.log("hello", profile);

      // Attach the profile to the request object for the next middleware
      req.profile = {
        google_id: profile.id,
        firstName: profile?._json?.given_name || "",
        lastName: profile?._json?.family_name || "",
        email: profile.emails[0].value,
        profileImageUrl: profile._json.picture,
      };

      next();
    })(req, res, next);
  },
  validateCreateRequest("user-google"), // Middleware to validate user data
  async (req, res, next) => {
    try {
      const { profile } = req;

      // Create a new user with validated Google profile data
      const newUser = await prisma.user.create({
        data: {
          google_id: profile.google_id,
          firstName: profile.firstName || "",
          lastName: profile.lastName || "",
          email: profile.email,
          profileImageUrl: profile.profileImageUrl,
        },
      });

      req.logIn(newUser, (err) => {
        if (err) {
          console.error("Login error:", err);
          return next(err);
        }

        // Redirect after successful sign-up
        res.redirect(`${process.env.CLIENT_URL}/`);
      });
    } catch (error) {
      console.error("Error during user creation:", error);
      res.redirect(
        `${process.env.CLIENT_URL}/sign-in?error=true&message=Internal server error`
      );
    }
  }
);

router.route("/auth/verify").post(catchAsync(verifyEmail));
router.route("/auth/email-code").post(catchAsync(sendEmailCode));
router.route("/auth/forgot-password").post(catchAsync(forgotPassword));



export default router;
