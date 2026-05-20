import dotenv from "dotenv";

dotenv.config();

export const sessionConfig = {
  name: "trackwise_session",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 3600000 * 7, // 7 days
    secure: false, // true in HTTPS
    httpOnly: true,
  },
  rolling: true,
};