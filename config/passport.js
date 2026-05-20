// config/passport.js

import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcrypt";
import {prisma} from "./prisma.js";
import { app } from "../index.js";

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

          if (!user) {
            return done(null, false, {
              message: "User doesn't exist",
            });
          }

          if (user.google_id) {
            return done(null, false, {
              message: "User already signed up with Google",
            });
          }

          const isValidPassword = await bcrypt.compare(
            password,
            user.password
          );

          if (!isValidPassword) {
            return done(null, false, {
              message: "Incorrect email or password",
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
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
        callbackURL: "/auth/google/sign-in/callback",
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

            return done(null, false, {
              message: "Account does not exist.",
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
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
        callbackURL: "/auth/google/sign-up/callback",
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
              message:
                "An account with this email already exists.",
            });
          }

          return done(null, profile);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );

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