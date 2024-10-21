const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const passport = require("passport");
const { decryptString } = require("../utils/customFunction");

const register = async (req, res, next) => {
  const { email, password, username, firstName, lastName, otp } = req.body;
  const code = await prisma.emailVerification.findFirst({
    where: {
      email,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  console.log("email", email);
  console.log("password", password);
  console.log("code", code.verificationCode);
  console.log("otp", otp);

  if (!code) {
    return res.status(400).json({
      success: false,
      message: "No OTP found for this email",
    });
  }
  //Check if the otp is valid
  if (code.verificationCode !== otp) {
    return res.status(400).json({
      success: false,
      message: "Invalid OTP",
    });
  }
  //Check if the OTP has expired
  const currentTime = new Date();
  if (currentTime > code.expirationTime) {
    return res.status(400).json({
      success: false,
      message: "OTP has expired",
    });
  }
  // Check for duplicate email
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    return res.status(400).json({
      success: false,
      message: "Email is already in use",
    });
  }

  // Check for duplicate username
  const existingUserByUsername = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUserByUsername) {
    return res.status(400).json({
      success: false,
      message: "Username is already taken",
    });
  }

  const decryptedPassword = decryptString(password);
  const hashedPassword = await bcrypt.hash(decryptedPassword, 10);
  const user = await prisma.user.create({
    data: {
      email: email,
      username: username,
      firstName: firstName,
      lastName: lastName,
      role: "user",
      password: hashedPassword,
    },
  });
  console.log(user)
  await prisma.emailVerification.update({
    where: {
      id: code.id,
    },
    data: {
      isVerified: true,
    },
  });

  req.login(user, (err) => {
    if (err) {
      return res.status(500).json({ message: "Error logging in" });
    }
    // Send user info without password
    return res
      .status(201)
      .json({ user: { id: user.id, username: user.username } });
  });
};

const login = async (req, res, next) => {
  return res.status(200).json({ message: 'Login successful', user: req.user });
}

module.exports = {
  register,
  login
};
