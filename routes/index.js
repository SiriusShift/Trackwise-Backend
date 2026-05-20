// routes/index.js
import UserRouter from "./auth.routes.js";
import EmailRouter from "./emails.routes.js";
import AssetRouter from "./assets.routes.js";
import CategoryRouter from "./categories.routes.js";
// import InstallmentRouter from "./installments.routes.js";
import TransactionRouter from "./transaction.routes.js";

import { swaggerDocs } from "../config/swaggerConfig.js";
import swaggerUi from "swagger-ui-express";
import { app } from "../index.js";

export const runRouters = () => {
  app.use("/", UserRouter);
  app.use("/aws-ses", EmailRouter);
  app.use("/assets", AssetRouter);
  app.use("/categories", CategoryRouter);
  // app.use("/loans", InstallmentRouter);
  app.use("/transactions", TransactionRouter);

  // Swagger Docs
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
};