import Joi from "joi";

export const id = Joi.number().integer().positive();

export const idParams = Joi.object({
  id: id.required(),
});

export const amount = Joi.number().positive();

export const description = Joi.string().trim().max(255);

export const currency = Joi.string().trim().uppercase().length(3);

export const dayOfMonth = Joi.number().integer().min(1).max(31);
