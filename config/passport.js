// config/passport.js

import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import { app } from "../app.js";
import { prisma } from "./prisma.js";

// Compared against when no real hash exists, to keep sign-in timing uniform.
const DUMMY_HASH = bcrypt.hashSync("trackwise-dummy-password", 10);

export const runPassport = () => {
  app.use(passport.initialize());
  app.use(passport.session());
  /*
  |--------------------------------------------------------------------------
  | Local Strategy
  |--------------------------------------------------------------------------
  */

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          // Unknown email, Google-only account (no password) and wrong password
          // all get the same message, and always cost one bcrypt compare, so
          // neither the response nor its timing reveals which emails exist.
          const isValidPassword = await bcrypt.compare(
            password,
            user?.password || DUMMY_HASH,
          );

          if (!user || !user.password || !isValidPassword) {
            return done(null, false, {
              message: "Incorrect email or password",
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      },
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | Google Sign In
  |--------------------------------------------------------------------------
  */

  passport.use(
    "google-sign-in",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL}/auth/google/sign-in/callback`,
        state: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await prisma.user.findFirst({
            where: {
              google_id: profile.id,
            },
          });

          if (!user) {
            const existingUser = await prisma.user.findUnique({
              where: {
                email: profile.emails?.[0]?.value,
              },
            });

            if (existingUser) {
              return done(null, false, {
                message:
                  "This email is already registered but not linked to Google.",
              });
            }

            // No account yet: sign the user up automatically
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(null, false, {
                message: "Google account has no email address.",
              });
            }

            const newUser = await prisma.user.create({
              data: {
                google_id: profile.id,
                firstName: profile._json?.given_name || "",
                lastName: profile._json?.family_name || "",
                email,
                profileImageUrl: profile._json?.picture,
              },
            });

            return done(null, newUser);
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      },
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | Google Sign Up
  |--------------------------------------------------------------------------
  */

  passport.use(
    "google-sign-up",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL}/auth/google/sign-up/callback`,
        state: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const existingUser = await prisma.user.findUnique({
            where: {
              email: profile.emails?.[0]?.value,
            },
          });

          if (existingUser) {
            return done(null, false, {
              message: "An account with this email already exists.",
            });
          }

          return done(null, profile);
        } catch (error) {
          return done(error, null);
        }
      },
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | Google Link (connect Google to an already-authenticated account)
  |--------------------------------------------------------------------------
  */

  passport.use(
    "google-link",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL}/auth/google/link/callback`,
        // Random per-request state stored in the session and verified on the
        // callback, so a callback URL crafted by an attacker (CSRF) is rejected.
        state: true,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          if (!req.user) {
            return done(null, false, { message: "Not authenticated" });
          }

          const existingLink = await prisma.user.findFirst({
            where: { google_id: profile.id },
          });

          if (existingLink && existingLink.id !== req.user.id) {
            return done(null, false, {
              message: "This Google account is already linked to another user.",
            });
          }

          const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { google_id: profile.id },
          });

          return done(null, updatedUser);
        } catch (error) {
          return done(error, null);
        }
      },
    ),
  );

  /*
  |--------------------------------------------------------------------------
  | Serialize User
  |--------------------------------------------------------------------------
  */
  /*
  |--------------------------------------------------------------------------
  | Serialize User
  |--------------------------------------------------------------------------
  */

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  /*
  |--------------------------------------------------------------------------
  | Deserialize User
  |--------------------------------------------------------------------------
  */

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};

/*
|--------------------------------------------------------------------------
| Graceful Prisma Shutdown
|--------------------------------------------------------------------------
*/

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default passport;
