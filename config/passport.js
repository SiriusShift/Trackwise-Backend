// passport.js
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt"); // Ensure you have bcrypt for password hashing
const { decryptString } = require("../utils/customFunction");
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
          console.log(password);

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

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if the user already exists using the googleId
          let user = await prisma.user.findUnique({
            where: { googleId: profile.id },
          });

          if (!user) {
            // If user doesn't exist, check if they exist by email
            user = await prisma.user.findUnique({
              where: { email: profile.emails[0].value },
            });

            if (user) {
              // If the user exists by email, link Google to their account
              user = await prisma.user.update({
                where: { email: profile.emails[0].value },
                data: { googleId: profile.id },
              });
            } else {
              // If no user exists, create a new one
              user = await prisma.user.create({
                data: {
                  googleId: profile.id,
                  email: profile.emails[0].value,
                  username: profile.displayName,
                },
              });
            }
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

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
