//routes
const UserRouter = require("./user");
const EmailRouter = require("./email");
const runRouters = (app) => {
  app.use("/sign-up", UserRouter);
  app.use("/aws-ses", EmailRouter);
};

module.exports = {
  runRouters,
};
