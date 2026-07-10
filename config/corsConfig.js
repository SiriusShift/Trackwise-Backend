import { AppError } from "../utils/AppError.js";

const allowedOrigins = [
  "http://localhost:5011",
  "http://192.168.1.3:5011",
  "http://192.168.1.15:5011",
  "http://10.10.13.15:5011",
  "http://192.168.68.53:5011",
  `http://localhost:${process.env.PORT}`,
];

export const corsConfig = {
  origin: (origin, callback) => {
    // allow server-to-server or curl (no origin)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new AppError(`Origin ${origin} not allowed by CORS`, 403));
  },

  credentials: true,
  optionsSuccessStatus: 200,
};