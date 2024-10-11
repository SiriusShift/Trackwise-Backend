const express = require("express");
const cors = require("cors");
const {runDb} = require('./config/runDb.js');
const {runRouters} = require("./routes/index.js");
const app = express();
const port = 5000;

runDb();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

runRouters(app);

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
