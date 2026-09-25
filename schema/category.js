import Joi from "joi";
import { amount, id } from "./common.js";

const categorySchema = Joi.object({
  name: Joi.string().trim().max(50).required(),
  type: Joi.string().trim().required(),
  icon: Joi.string().trim(),
  color: Joi.string().trim(),
});

export const createCategorySchema = Joi.array().items(categorySchema).min(1);

export const createCategoryQuery = Joi.object({
  admin: Joi.boolean(),
});

const periods = ["monthly", "yearly"];

export const createLimitSchema = Joi.object({
  amount: amount.required(),
  categoryId: id.required(),
  period: Joi.string().valid(...periods).required(),
});

export const updateLimitSchema = Joi.object({
  amount: amount.required(),
});
