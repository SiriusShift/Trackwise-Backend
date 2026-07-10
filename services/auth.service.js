// services/auth.service.js

import bcrypt from "bcrypt";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { decryptString } from "../utils/customFunction.js";
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
    throw new AppError("No OTP found for this email", 404);
  }

  if (code.verificationCode !== otp) {
    throw new AppError("Invalid OTP", 400);
  }

  if (new Date() > code.expirationTime) {
    throw new AppError("OTP has expired", 400);
  }
  // Check duplicate email
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    throw new AppError("Email is already in use", 409);
  }

  // Check duplicate username
  const existingUserByUsername = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUserByUsername) {
    throw new AppError("Username is already taken", 409);
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
    throw new AppError("Invalid token", 400);
  }

  if (new Date() > findToken.expiresAt) {
    throw new AppError("Token has expired", 400);
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