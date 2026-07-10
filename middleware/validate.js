import { googleSignupSchema, resetPasswordSchema, signupSchema } from "../schema/user.js";
import { AppError } from "../utils/AppError.js";
import { decryptString } from "../utils/customFunction.js";

export const validateCreateRequest = (requestType) => {
  return (req, res, next) => {
    let error;

    switch (requestType) {
      case "user":
        error = signupSchema.validate({
          ...req.body,
          password: decryptString(req.body.password),
        }).error;
        break;
      case "user-google":
        error = googleSignupSchema.validate({
          ...req.profile,
        }).error;
        break;
      default:
        console.log(`No validation for ${requestType}`);
    }

    if (error) {
      const msg = error.details.map((el) => el.message).join(",");
      // Instead of throwing an error directly, call next with the error
      throw new AppError(msg, 400);
    } else {
      next(); // If no error, call next
    }
  };
};

export const validateUserUpdateRequest = (requestType) => {
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
