import cors from "cors";
import express from "express";
import session from "express-session";

import { corsConfig } from "./config/corsConfig.js";
import { runPassport } from "./config/passport.js";
import { sessionConfig } from "./config/sessionConfig.js";
import { runRouters } from "./routes/index.js";

import compression from "compression";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";

export const app = express();

// Trust proxy if deploying behind Nginx, Render, Railway, etc.
app.set("trust proxy", 1);

// Middleware
app.use(helmet());
app.use(cors(corsConfig));
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}
app.use(compression());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(session(sessionConfig));



// Passport
runPassport();

// Health Check
app.get("/", (_, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
  });
});

// Routes
runRouters();

// 404
app.use(notFound);

// Error handler (always last)
app.use(errorHandler);