//routes
const UserRouter = require("./user");
const runRouters = (app) => {
    app.use("/sign-up", UserRouter);
};

module.exports = {
    runRouters
}