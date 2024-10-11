const ExpressError = require("../utils/expressError");
const { userSchema } = require("../schema/user");

const validateCreateRequest = (requestType) => {
  return (req, res, next) => {
    let error;

    switch (requestType) {
      case "user":
        error = userSchema.validate(req.body).error;
        break;
      default:
        console.log(`No validation for ${requestType}`);
    }
    
    if (error) {
      const msg = error.details.map((el) => el.message).join(",");
      // Instead of throwing an error directly, call next with the error
      return next(error); // Call next with an instance of ExpressError
    } else {
      next(); // If no error, call next
    }
  };
};

module.exports = { validateCreateRequest };
