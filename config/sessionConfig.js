import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

export const sessionConfig = {
  name: "trackwise_session",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 3600000 * 7, // 7 days
    secure: isProduction, // requires HTTPS
    httpOnly: true,
    // Cross-origin frontend/backend (different host/port) needs SameSite=None,
    // which browsers only honor when the cookie is also Secure.
    sameSite: isProduction ? "none" : "lax",
  },
  rolling: true,
};