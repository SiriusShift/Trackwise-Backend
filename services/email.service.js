import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

import { AppError } from "../utils/AppError.js";
import {
  sendEmail,
  verifyEmailAddress,
} from "./ses.service.js";

const prisma = new PrismaClient();

const year = new Date().getFullYear();

export const sendEmailCode = async ({ email, username }) => {
  if (!email || !Array.isArray(email)) {
    throw new AppError("Invalid email format.", 400);
  }

  const emailAddress = email[0];

  const existingEmail = await prisma.user.findFirst({
    where: {
      email: emailAddress,
    },
  });

  if (existingEmail) {
    throw new AppError(
      "Email already exists in our database.",
      409
    );
  }

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

  const code = crypto
    .randomInt(0, 1000000)
    .toString()
    .padStart(6, "0");

  await sendEmail(
    emailAddress,
    { code, year },
    "Verification_Code"
  );

  await prisma.emailVerification.create({
    data: {
      email: emailAddress,
      verificationCode: code,
      expirationTime: new Date(Date.now() + 5 * 60 * 1000),
      isVerified: false,
    },
  });

  return {
    success: true,
    message: "Email sent.",
  };
};

export const forgotPassword = async ({ email }) => {
  if (!email || !Array.isArray(email)) {
    throw new AppError("Invalid email format.", 400);
  }

  const emailAddress = email[0];

  const user = await prisma.user.findFirst({
    where: {
      email: emailAddress,
    },
  });

  if (!user) {
    throw new AppError("Email doesn't exist.", 404);
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
    throw new AppError(
      "A reset link was already sent. Please wait 5 minutes before requesting again.",
      429
    );
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

  await sendEmail(
    emailAddress,
    {
      code: token,
      year,
    },
    "Reset_Password"
  );

  return {
    success: true,
    message: "Email sent. Check your inbox and spam folder.",
  };
};

export const verifyEmail = async ({ email }) => {
  if (!email || !Array.isArray(email)) {
    throw new AppError("Invalid email format.", 400);
  }

  const result = await verifyEmailAddress(email);

  if (!result) {
    throw new AppError(
      "Failed to verify email address.",
      400
    );
  }

  return {
    success: true,
    message: "Email verified.",
  };
};