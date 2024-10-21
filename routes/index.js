//routes
const UserRouter = require("./user");
const EmailRouter = require("./email");
const runRouters = (app) => {
  app.use("/", UserRouter);
  app.use("/aws-ses", EmailRouter);
};

module.exports = {
  runRouters,
};
