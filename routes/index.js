// routes
const UserRouter = require("./users.routes");
const EmailRouter = require("./emails.routes");
const AssetRouter = require("./assets.routes");
const CategoryRouter = require("./categories.routes");
const InstallmentRouter = require("./installments.routes");
const TransactionRouter = require("./transaction.routes")
const { swaggerUi, swaggerDocs } = require("../config/swaggerConfig");

const runRouters = (app) => {
  app.use("/", UserRouter);
  app.use("/aws-ses", EmailRouter);
  app.use("/asset", AssetRouter);
  app.use("/category", CategoryRouter);
  app.use("/loan", InstallmentRouter);
  app.use("/transaction", TransactionRouter);

  // Serve Swagger UI at /api-docs
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
};

module.exports = {
  runRouters,
};
