import Joi from "joi";
import {
    passwordPattern,
    passwordError
} from "../constants/user.js"

export const signupSchema = Joi.object({
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    username: Joi.string().required(),
    email: Joi.string().email().required(),
    otp: Joi.string().required(),
    timezone: Joi.string().required(),
    // phone_number: Joi.string().pattern(phonePattern).messages({
    //     "string.pattern.base": phoneError,
    // }),
    password: Joi.string().required().pattern(passwordPattern).messages({
        "string.pattern.base": passwordError,
    }),
    // role: Joi.string().valid(...roles).optional().default(defRole),
});

export const googleSignupSchema = Joi.object({
    firstName: Joi.string().required(),
    google_id: Joi.string().required(),
    profileImageUrl: Joi.string(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
    password: Joi.string().required().pattern(passwordPattern).messages({
        "string.pattern.base": passwordError,
    }),
    token: Joi.string().required()
});

// Email is sent as an array by the client, e.g. ["user@mail.com"]
const emailList = Joi.array().items(Joi.string().email()).min(1).required();

export const signinSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

export const sendEmailCodeSchema = Joi.object({
    email: emailList,
    username: Joi.string().trim().required(),
});

export const emailSchema = Joi.object({
    email: emailList,
});
