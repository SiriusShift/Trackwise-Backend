import Joi from "joi";
import { amount, description, id } from "./common.js";

export const createSavingsGoalSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  targetAmount: amount.required(),
  targetDate: Joi.date().allow(null),
  icon: Joi.string().trim().max(50),
  // Linked goals track the asset's balance; unlinked ones use currentAmount
  assetId: id.allow(null),
  currentAmount: Joi.number().min(0),
});

export const updateSavingsGoalSchema = Joi.object({
  name: Joi.string().trim().max(100),
  targetAmount: amount,
  targetDate: Joi.date().allow(null),
  icon: Joi.string().trim().max(50),
  assetId: id.allow(null),
  currentAmount: Joi.number().min(0),
  isActive: Joi.boolean(),
}).min(1);

// Destination is the goal's linked account, so only the source is sent
export const contributeSavingsSchema = Joi.object({
  amount: amount.required(),
  account: id.required(),
  category: id.required(),
  date: Joi.date(),
  description: description.allow(""),
});

export const getSavingsGoalsQuery = Joi.object({
  isActive: Joi.boolean(),
});
