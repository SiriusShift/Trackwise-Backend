// routes/index.js
import AssetRouter from "./assets.routes.js";
import UserRouter from "./auth.routes.js";
import CategoryRouter from "./categories.routes.js";
// import InstallmentRouter from "./installments.routes.js";
import TransactionRouter from "./transaction.routes.js";

import { app } from "../app.js";

export const runRouters = () => {
  app.use("/", UserRouter);
  app.use("/assets", AssetRouter);
  app.use("/categories", CategoryRouter);
  app.use("/transactions", TransactionRouter);

};