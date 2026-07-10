import { promisify } from "node:util";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";
import * as emailService from "../services/email.service.js";

export const register = asyncHandler(async (req, res) => {
  const user = await authService.registerUserService(req.body);

  const login = promisify(req.login.bind(req));
  await login(user);

  res.status(201).json({
    success: true,
    message: "User registered successfully.",
    user: {
      id: user.id,
      username: user.username,
    },
  });
});

export const login = asyncHandler(async (req, res, next) => {
  const result = await authService.loginService(req.user);

  return res.status(200).json(result);
});

export const resetPassword = asyncHandler(async (req, res, next) => {
  const result = await authService.resetPasswordService(req.body);

  return res.status(200).json(result);
});

export const isAuthenticated = asyncHandler(async (req, res) => {
  const result = await authService.isAuthenticatedService(req.user);

  res.status(200).json(result);
});

export const logout = asyncHandler(async (req, res) => {
  const result = await authService.logoutService(req);

  res.clearCookie("trackwise_session");

  res.status(200).json(result);
});



export const sendEmailCode = asyncHandler(async (req, res) => {
  const result = await emailService.sendEmailCode(req.body);

  res.status(200).json(result);
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await emailService.forgotPassword(req.body);

  res.status(200).json(result);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const result = await emailService.verifyEmail(req.body);

  res.status(200).json(result);
});