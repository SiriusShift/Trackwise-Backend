const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");


// Configs
const {runDb} = require('./config/runDb.js');
const {corsConfig} = require('./config/corsConfig.js');
const {runRouters} = require("./routes/index.js");
const {sessionConfig} = require('./config/sessionConfig.js');
const {runPassport} = require('./config/passport.js');

const app = express();
const port = 5000;
const host = process.env.URL;

runDb();

app.use(cors(corsConfig));
app.use(session(sessionConfig));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

runPassport(app);
runRouters(app);

app.listen(port, host, () => {
  console.log(`Server started on port ${port}`);
});
