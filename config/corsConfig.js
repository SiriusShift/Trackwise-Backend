const cors = require("cors");
const ExpressError = require("../utils/expressError");
const allowedOrigins = [
  `http://localhost:5173`, // front end
  `http://192.168.1.3:5173`,
  `http://10.10.13.15:5173`,

  `http://localhost:${process.env.PORT}`,
];

const corsConfig = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      // Remove the non-null assertion (!)
      callback(null, true);
    } else {
      callback(new ExpressError("Not Allowed By CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

module.exports = { corsConfig };
