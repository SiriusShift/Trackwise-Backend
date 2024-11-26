// swagger-config.js
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
      description: "A simple Express API",
    },
    servers: [
      {
        url: "http://localhost:5000", // Replace with your server URL
      },
    ],
  },
  // Define where to look for JSDoc comments for routes
  apis: ["./routes/*.js", "./models/*.js"], // Adjust the paths to your project structure
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

module.exports = { swaggerUi, swaggerDocs };
