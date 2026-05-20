import { isAuthenticatedService, loginService, registerUserService } from "../services/auth.service.js";
import bcrypt from "bcrypt"
import  { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import passport from "passport";
import { decryptString } from "../utils/customFunction.js";

export const register = async (req, res, next) => {
  try {
    const user = await registerUserService(req.body);

    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Error logging in",
        });
      }

      return res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
        },
      });
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await loginService(req.user);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const result = await resetPasswordService(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const isAuthenticated = async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        authenticated: false,
        message: "Unauthorized",
      });
    }

    const result = await isAuthenticatedService(req.user);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const result = await logoutService(req);

    res.clearCookie("trackwise_session");

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
