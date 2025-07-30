const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const passport = require("passport");
const { decryptString } = require("../utils/customFunction");

const register = async (req, res, next) => {
  const { email, password, timezone, username, firstName, lastName, otp } = req.body;
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
  const settings = await prisma.settings.create({
    data: {
      timezone: timezone
    }
  })
  console.log(user);
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
  console.log(req.user);
  console.log("login authenticated: ", req.isAuthenticated());
  console.log("login req.session: ", req.session);
  return res.status(200).json({ message: "Login successful" });
};

const resetPassword = async (req, res, next) => {
  const { id, password, token } = req.body;
  console.log(id, password, token);
  const hashedPassword = await bcrypt.hash(password, 10);
  const findToken = await prisma.resetToken.findFirst({
    where: {
      token: token,
      userId: id,
    },
  });

  if (!findToken) {
    return res.status(400).json({
      success: false,
      message: "Invalid token",
    });
  }

  const currentTime = new Date();
  if (currentTime > findToken.expiresAt) {
    return res.status(400).json({
      success: false,
      message: "OTP has expired",
    });
  }

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      password: hashedPassword,
    },
  });

  await prisma.resetToken.delete({
    where: {
      token: token,
    },
  });

  return res.status(200).json({
    success: true,
    message: "Password reset successful",
  });
};

const isAuthenticated = async (req, res, next) => {
  console.log("authenticated1: ", req.isAuthenticated());
  console.log("req.session1: ", req.session);
  if (req.isAuthenticated()) {
    const settings = await prisma.settings.findFirst({
      where: {
        userId: req.user.id,
      },
      select: {
        timezone: true,
        timeFormat: true
      }
    });
    return res.status(200).json({
      authenticated: true,
      user: {
        id: req.user.id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        username: req.user.username,
        role: req.user.role,
        phoneNumber: req.user.phoneNumber,
        profileImage: req.user.profileImageUrl,
      },
      settings: settings,
    });
  }
  return res
    .status(401)
    .json({ authenticated: false, message: "Unauthorized" });
};

const logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    console.log(req.isAuthenticated());
    console.log(req.session);
    req.session.destroy(() => {
      res.clearCookie("trackwise_session"); // Clear the session cookie
      res.status(200).json({ message: "Logout successful" });
    });
  });
};

module.exports = {
  register,
  login,
  resetPassword,
  isAuthenticated,
  logout,
};
