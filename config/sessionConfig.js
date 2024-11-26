require("dotenv").config();

const sessionConfig = {
    name: "trackwise_session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 3600000, // 1 hour in milliseconds
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
    },
    rolling: true,
  };
  
module.exports = { sessionConfig }