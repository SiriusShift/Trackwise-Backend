// services/auth.service.js

import bcrypt from "bcrypt";
import  { PrismaClient } from "@prisma/client";
import { decryptString } from "../utils/customFunction.js";


const prisma = new PrismaClient();
export const registerUserService = async ({
  email,
  password,
  timezone,
  username,
  firstName,
  lastName,
  otp,
}) => {
  // Check OTP
  const code = await prisma.emailVerification.findFirst({
    where: { email },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!code) {
    throw new Error("No OTP found for this email");
  }

  if (code.verificationCode !== otp) {
    throw new Error("Invalid OTP");
  }

  if (new Date() > code.expirationTime) {
    throw new Error("OTP has expired");
  }

  // Check duplicate email
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    throw new Error("Email is already in use");
  }

  // Check duplicate username
  const existingUserByUsername = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUserByUsername) {
    throw new Error("Username is already taken");
  }

  const decryptedPassword = decryptString(password);

  const hashedPassword = await bcrypt.hash(decryptedPassword, 10);

  // Transaction for consistency
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        username,
        firstName,
        lastName,
        role: "user",
        password: hashedPassword,
      },
    });

    await tx.settings.create({
      data: {
        timezone,
        timeFormat: "hh:mm A",
        currency: "PHP",
        emailNotification: false,
        mobileNotification: false,
        notifyDays: 2,
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    });

    await tx.emailVerification.update({
      where: {
        id: code.id,
      },
      data: {
        isVerified: true,
      },
    });

    return user;
  });

  return result;
};

export const loginService = async (user) => {
  return {
    message: "Login successful",
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  };
};

export const resetPasswordService = async ({ password, token }) => {
  const findToken = await prisma.resetToken.findFirst({
    where: {
      token,
    },
  });

  if (!findToken) {
    throw new Error("Invalid token");
  }

  if (new Date() > findToken.expiresAt) {
    throw new Error("Token has expired");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id: findToken.userId,
      },
      data: {
        password: hashedPassword,
      },
    });

    await tx.resetToken.delete({
      where: {
        token,
      },
    });
  });

  return {
    success: true,
    message: "Password reset successful",
  };
};

export const isAuthenticatedService = async (user) => {
  const settings = await prisma.settings.findFirst({
    where: {
      userId: user.id,
    },
    select: {
      timezone: true,
      timeFormat: true,
      currency: true,
    },
  });

  return {
    authenticated: true,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      role: user.role,
      phoneNumber: user.phoneNumber,
      profileImage: user.profileImageUrl,
    },
    settings,
  };
};

export const logoutService = (req) => {
  return new Promise((resolve, reject) => {
    req.logout((err) => {
      if (err) {
        return reject(err);
      }

      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          return reject(sessionErr);
        }

        resolve({
          success: true,
          message: "Logout successful",
        });
      });
    });
  });
};