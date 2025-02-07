// passport.js
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt"); // Ensure you have bcrypt for password hashing
const { decryptString } = require("../utils/customFunction");
const { exist } = require("joi");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const prisma = new PrismaClient();

const runPassport = (app) => {
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure Local Strategy for authentication
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email", // Specify the email field
        passwordField: "password", // Specify the password field
      },
      async (email, password, done) => {
        try {
          // Find user by email
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) {
            return done(null, false, {
              message: "User doesn't exist",
            });
          }
          
          if(user.google_id){
            return done(null, false, {
              message: "User already signed up with Google",
            });
          }

          // Compare hashed password
          const isValidPassword = await bcrypt.compare(password, user.password);
          console.log(isValidPassword);
          if (!isValidPassword) {
            return done(null, false, {
              message: "Incorrect username or password.",
            });
          }
          console.log(email, password);

          return done(null, user); // Authentication successful
        } catch (err) {
          return done(err); // Handle error
        }
      }
    )
  );

  passport.use('google-sign-in', new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/sign-in/callback", // Specify sign-in callback
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log("profile", profile);
      try {
        // Check if the user is already linked with Google
        const user = await prisma.user.findFirst({
          where: { google_id: profile.id },
        });
  
        if (!user) {
          // If no user exists with the Google ID, check by email
          const existingUser = await prisma.user.findUnique({
            where: { email: profile.emails[0].value },
          });
  
          if (existingUser) {
            console.log("existing user found with same email");
            return done(null, false, {
              message:
                "This email is already registered but not linked to Google. Please sign in with your email and password.",
            });
          }
          return done(null, false, { message: "Account does not exist." });
        }
  
        return done(null, user); // Successful sign-in
      } catch (err) {
        return done(err, null);
      }
    }
  ));
  
  passport.use('google-sign-up', new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/sign-up/callback", // Specify sign-up callback
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if the user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: profile.emails[0].value },
        });
  
        if (existingUser) {
          return done(null, false, {
            message:
              "An account with this email already exists. Please sign in using your email and password.",
          });
        }
  
        console.log("User successfully signed up:", profile);
        return done(null, profile); // Successful sign-up
      } catch (err) {
        console.error("Error during Google sign-up:", err);
        return done(err, null);
      }
    }
  ));
  

  // Serialize user to store user ID in session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session using the user ID
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user); // Send user data back to Passport
    } catch (err) {
      done(err, null); // Handle error
    }
  });
};

// Properly close Prisma client on application exit
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { runPassport };
