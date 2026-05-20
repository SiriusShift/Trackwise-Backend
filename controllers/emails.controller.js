import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

import ExpressError from "../utils/expressError.js";
import {
  verifyEmailAddress,
  sendEmail
} from "../services/ses.service.js";
// import {
//   sendEmail,
// } from "../services/email.service.js";
const prisma = new PrismaClient();

const year = new Date().getFullYear();

/*
|--------------------------------------------------------------------------
| Send Email Verification Code
|--------------------------------------------------------------------------
*/
export const sendEmailCode = async (req, res, next) => {
  const { email, username } = req.body;

  // Validate input format
  if (!email || !Array.isArray(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  // Generate 6-digit code
  const code = crypto
    .randomInt(0, 1000000)
    .toString()
    .padStart(6, "0");

  try {
    const existingEmail = await prisma.user.findFirst({
      where: { email: email[0] },
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists in our database",
      });
    }

    const existingUsername = await prisma.user.findFirst({
      where: { username },
    });

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: "Username already exists in our database",
      });
    }

    const payload = { code, year };

    await sendEmail(email[0], payload, "Verification_Code");
    // await sendEmail(email[0], code, "Your verification code");

    await prisma.emailVerification.create({
      data: {
        email: email[0],
        verificationCode: code,
        expirationTime: new Date(Date.now() + 5 * 60 * 1000),
        isVerified: false,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Email sent",
    });
  } catch (err) {
    console.error("Error while sending email:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/*
|--------------------------------------------------------------------------
| Forgot Password
|--------------------------------------------------------------------------
*/
export const forgotPassword = async (req, res, next) => {
  const { email } = req.body;

  if (!email || !Array.isArray(email)) {
    return res.status(400).json({ message: "Invalid format" });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: email[0] },
    });

    if (!user) {
      return res.status(400).json({ message: "Email doesn't exist" });
    }

    // Check recent reset request (rate limiting)
    const existingRequest = await prisma.resetToken.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: { createdAt: "desc" },
    });

    if (
      existingRequest &&
      Date.now() - new Date(existingRequest.createdAt).getTime() <
        5 * 60 * 1000
    ) {
      return res.status(429).json({
        message:
          "A reset link was already sent. Please wait 5 minutes before requesting again.",
      });
    }

    // Generate unique token
    let token;
    let isUnique = false;

    while (!isUnique) {
      token = crypto
        .randomInt(0, 1000000)
        .toString()
        .padStart(6, "0");

      const exists = await prisma.resetToken.findUnique({
        where: { token },
      });

      if (!exists) isUnique = true;
    }

    const expirationTime = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.resetToken.create({
      data: {
        token,
        expiresAt: expirationTime,
        user: { connect: { id: user.id } },
      },
    });

    const payload = {
      code: token,
      year,
    };

    await sendEmail(email[0], payload, "Reset_Password");
    // await sendEmail(email[0], code, "Your reset code");

    return res.status(200).json({
      success: true,
      message: "Email sent. Check your inbox and spam folder.",
    });
  } catch (err) {
    console.error("Error in forgotPassword:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/*
|--------------------------------------------------------------------------
| Verify Email (Sandbox Mode)
|--------------------------------------------------------------------------
*/
export const verifyEmail = async (req, res, next) => {
  const { email } = req.body;

  if (!email || !Array.isArray(email)) {
    return res.status(400).json({ message: "Invalid format" });
  }

  try {
    const result = await verifyEmailAddress(email);

    if (!result) {
      return res.status(400).json({
        success: false,
        message: "Failed to verify email address",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Email verified",
    });
  } catch (err) {
    console.error("Error while verifying email address:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};