import crypto from "crypto";

import { AppError } from "../utils/AppError.js";
import { sendEmail as sesSendEmail } from "./ses.service.js";
import { sendEmail as mailSendEmail } from "./mail.service.js";

import { prisma } from "../config/prisma.js";

// Set EMAIL_PROVIDER=aws to use AWS SES; defaults to SMTP (Render/nodemailer)
const useAWS = process.env.EMAIL_PROVIDER === "aws";
const sendEmail = useAWS ? sesSendEmail : mailSendEmail;

const year = new Date().getFullYear();

// Send without making the caller wait. Awaiting the send would make the
// response slower for registered emails than for unknown ones, which leaks
// whether an account exists.
const sendInBackground = (emailAddress, data, template) => {
  sendEmail(emailAddress, data, template).catch((err) => {
    console.error(`Failed to send "${template}" email:`, err.message);
  });
};

export const sendEmailCode = async ({ email, username }) => {
  if (!email || !Array.isArray(email)) {
    throw new AppError("Invalid email format.", 400);
  }

  const emailAddress = email[0];

  const existingUsername = await prisma.user.findFirst({
    where: {
      username,
    },
  });

  if (existingUsername) {
    throw new AppError(
      "Username already exists in our database.",
      409
    );
  }

  const existingEmail = await prisma.user.findFirst({
    where: {
      email: emailAddress,
    },
  });

  // Same response whether or not the email is registered, so this endpoint
  // can't be used to find out who has an account. No code is sent or stored
  // for registered emails.
  if (!existingEmail) {
    const code = crypto
      .randomInt(0, 1000000)
      .toString()
      .padStart(6, "0");

    await prisma.emailVerification.create({
      data: {
        email: emailAddress,
        verificationCode: code,
        expirationTime: new Date(Date.now() + 5 * 60 * 1000),
        isVerified: false,
      },
    });

    sendInBackground(emailAddress, { code, year }, "Verification_Code");
  }

  return {
    success: true,
    message: "If this email can be registered, a verification code has been sent.",
  };
};

export const forgotPassword = async ({ email }) => {
  if (!email) {
    throw new AppError("Invalid email format.", 400);
  }

  const emailAddress = email;

  // Identical response for unknown emails, rate-limited users and successes.
  const response = {
    success: true,
    message:
      "If an account exists for this email, a reset code has been sent. Check your inbox and spam folder.",
  };

  const user = await prisma.user.findFirst({
    where: {
      email: emailAddress,
    },
  });

  if (!user) {
    return response;
  }

  const existingRequest = await prisma.resetToken.findFirst({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (
    existingRequest &&
    Date.now() - new Date(existingRequest.createdAt).getTime() <
    5 * 60 * 1000
  ) {
    return response;
  }

  let token;

  while (true) {
    token = crypto
      .randomInt(0, 1000000)
      .toString()
      .padStart(6, "0");

    const exists = await prisma.resetToken.findUnique({
      where: {
        token,
      },
    });

    if (!exists) break;
  }

  await prisma.resetToken.create({
    data: {
      token,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      user: {
        connect: {
          id: user.id,
        },
      },
    },
  });

  sendInBackground(
    emailAddress,
    {
      code: token,
      year,
    },
    "Reset_Password"
  );

  return response;
};
