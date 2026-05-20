// app.js / server.js

import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";

import "./config/cron.js";

// Configs
import { corsConfig } from "./config/corsConfig.js";
import { sessionConfig } from "./config/sessionConfig.js";
import { runPassport } from "./config/passport.js";

// Routes
import { runRouters } from "./routes/index.js";

export const app = express();
const port = process.env.PORT || 5000; // Fallback to 3000 if not set
const host = process.env.URL;

// runDb();

app.use(cors(corsConfig));
app.use(session(sessionConfig));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

runPassport();
runRouters();

// app.listen(port, () => {
//   console.log(`Server started on port ${port}`);
// });

app.listen(5000, host, () => {
  console.log(`Server started on port ${port}`);
});
