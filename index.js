// app.js / server.js

import cors from "cors";
import express from "express";
import session from "express-session";

import "./config/cron.js";

// Configs
import { corsConfig } from "./config/corsConfig.js";
import { runPassport } from "./config/passport.js";
import { sessionConfig } from "./config/sessionConfig.js";

// Routes
import { runRouters } from "./routes/index.js";

export const app = express();
const port = process.env.PORT || 5000; // Fallback to 3000 if not set
const host = process.env.URL;

// runDb();


app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use(cors(corsConfig));
app.use(session(sessionConfig));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

runPassport();
runRouters();

// app.listen(port, () => {
//   console.log(`Server started on port ${port}`);
// });

// app.listen(5000, host, () => {
//   console.log(`Server started on port ${port}`);
// });
