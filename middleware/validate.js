const ExpressError = require("../utils/expressError");
const { signupSchema, resetPasswordSchema } = require("../schema/user");
const { decryptString } = require("../utils/customFunction");

const validateCreateRequest = (requestType) => {
  return (req, res, next) => {
    let error;

    switch (requestType) {
      case "user":
        error = signupSchema.validate({
          ...req.body,
          password: decryptString(req.body.password),
        }).error;
        break;
      default:
        console.log(`No validation for ${requestType}`);
    }

    if (error) {
      const msg = error.details.map((el) => el.message).join(",");
      // Instead of throwing an error directly, call next with the error
      throw new ExpressError(msg, 400);
    } else {
      next(); // If no error, call next
    }
  };
};

const validateUserUpdateRequest = (requestType) => {
  return (req, res, next) => {
    let error;
    switch (requestType) {
      case "password":
        error = resetPasswordSchema.validate(req.body).error;
        break;
      default:
        console.log(`No validation for ${requestType}`);
    }
    if (error) {
      const msg = error.details.map((el) => el.message).join(",");
      // Instead of throwing an error directly, call next with the error
      throw new ExpressError(msg, 400);
    } else {
      next(); // If no error, call next
    }
  };
};

const isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

module.exports = { validateCreateRequest, isLoggedIn, validateUserUpdateRequest };
