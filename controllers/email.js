const ExpressError = require("../utils/expressError");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const crypto = require("crypto");
const { decryptString } = require("../utils/customFunction");
const { sendEmail, verifyEmailAddress } = require("../utils/emailService");
const sendEmailCode = async (req, res, next) => {
  const { email, device, fullName } = req.body;
  console.log(decryptString(device));
  // Generate a 6-digit verification code
  const code = crypto.randomInt(0, Math.pow(10, 6)).toString().padStart(6, "0");
  console.log(code);
  const message = `Your verification code is: ${code}`;
  const title = "Email verification code";
  console.log(email[0]);

  if (!email || !Array.isArray(email)) {
    return res.status(400).json({
      message: "Invalid format",
    });
  }
  try {
    // Send a verification email using Amazon SES
    await sendEmail(email, message, title, fullName);
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
};
