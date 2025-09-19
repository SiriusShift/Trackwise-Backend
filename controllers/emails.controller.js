const ExpressError = require("../utils/expressError");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const crypto = require("crypto");
const { decryptString, generateToken } = require("../utils/customFunction");
const { sendEmail, verifyEmailAddress } = require("../services/ses.service");

const year = new Date().getFullYear();

const sendEmailCode = async (req, res, next) => {
  const { email, username } = req.body;
  // Generate a 6-digit verification code
  const code = crypto.randomInt(0, Math.pow(10, 6)).toString().padStart(6, "0");

  const checkExistingEmail = await prisma.user.findFirst({
    where: {
      email: email[0],
    },
  });

  const checkExistingUsername = await prisma.user.findFirst({
    where: {
      username: username,
    },
  });

  if (checkExistingEmail) {
    return res.status(400).json({
      success: false,
      message: "Email already exists in our database",
    });
  } else if (checkExistingUsername) {
    return res.status(400).json({
      success: false,
      message: "Username already exists in our database",
    });
  }

  if (!email || !Array.isArray(email)) {
    return res.status(400).json({
      message: "Invalid format",
    });
  }
  try {
    const data = {
      code: code,
      year: year,
    };
    // Send a verification email using Amazon SES
    await sendEmail(email, data, "Verification_Code");
    // add the otp code to database to be used later for comparing
    await prisma.emailVerification.create({
      data: {
        email: email[0],
        verificationCode: code,
        // expiration time of 5 minutes for the code
        expirationTime: new Date(Date.now() + 5 * 60 * 1000),
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return res.status(200).json({
      success: true,
      message: "Email sent",
    });
  } catch (err) {
    console.log("Error while sending email", err);
    return res.json(500).json({
      error: "Internal server error",
    });
  }
};

const forgotPassword = async (req, res, next) => {
  const email = req.body;

  const code = crypto.randomInt(0, Math.pow(10, 6)).toString().padStart(6, "0");

  if (!email || !Array.isArray(email)) {
    return res.status(400).json({ message: "Invalid format" });
  }

  try {
    // Check if a reset request was recently made
    const existingRequest = await prisma.resetToken.findFirst({
      where: {
        user: { email: email[0] },
      },
      orderBy: { createdAt: "desc" }, // Get the latest request
    });

    if (
      existingRequest &&
      new Date() - new Date(existingRequest.createdAt) < 5 * 60 * 1000
    ) {
      return res.status(429).json({
        message:
          "A reset link was already sent. Please wait 5 minutes before requesting again.",
      });
    }

    // Generate a unique reset token
    let valid = false;
    let token;
    while (!valid) {
      token = crypto.randomInt(0, Math.pow(10, 6)).toString().padStart(6, "0");
      const tokenExist = await prisma.resetToken.findUnique({
        where: { token },
      });
      if (!tokenExist) valid = true;
    }

    // Set expiration time (5 minutes from now)
    const expirationTime = new Date(Date.now() + 5 * 60 * 1000);

    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: email[0] },
    });

    if (!user) {
      return res.status(400).json({ message: "Email doesn't exist" });
    }

    // Save reset token in the database
    await prisma.resetToken.create({
      data: {
        token,
        expiresAt: expirationTime,
        createdAt: new Date(),
        user: { connect: { id: user.id } },
      },
    });

    const data = {
      code: code,
      year: year,
    };

    // Send the email
    await sendEmail(email[0], data, "Reset_Password");

    return res.status(200).json({
      success: true,
      message: "Email sent. Check your inbox and spam folder.",
    });
  } catch (err) {
    console.error("Error while verifying email address:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// THIS IS FOR VERIFYING EMAIL IN SANDBOX MODE
const verifyEmail = async (req, res, next) => {
  const { email } = req.body;
  if (!email || !Array.isArray(email)) {
    return res.status(400).json({
      message: "Invalid format",
    });
  }
  try {
    const verificationSuccess = await verifyEmailAddress(email);
    if (verificationSuccess) {
      return res.status(200).json({
        success: true,
        message: "Email verified",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to verify email address",
      });
    }
  } catch (err) {
    console.log("Error while verifying email address", err);
    return res.json(500).json({
      error: "Internal server error",
    });
  }
};

module.exports = {
  sendEmailCode,
  verifyEmail,
  forgotPassword,
};
