// passport.js
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt"); // Ensure you have bcrypt for password hashing
const { decryptString } = require("../utils/customFunction");

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
