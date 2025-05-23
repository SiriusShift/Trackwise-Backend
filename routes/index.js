// routes
const UserRouter = require("./user");
const EmailRouter = require("./email");
const AssetRouter = require("./asset");
const CategoryRouter = require("./category");
const TransactionRouter = require("./transaction");
const FrequencyRouter = require("./frequency");
const { swaggerUi, swaggerDocs } = require("../config/swaggerConfig");

const runRouters = (app) => {
  app.use("/", UserRouter);
  app.use("/aws-ses", EmailRouter);
  app.use("/asset", AssetRouter);
  app.use("/category", CategoryRouter);
  app.use("/transaction", TransactionRouter);
  app.use("/frequency", FrequencyRouter);

  // Serve Swagger UI at /api-docs
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
};

module.exports = {
  runRouters,
};
