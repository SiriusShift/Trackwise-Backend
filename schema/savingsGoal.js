import Joi from "joi";
import { amount, id } from "./common.js";

export const createSavingsGoalSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  targetAmount: amount.required(),
  targetDate: Joi.date().allow(null),
  // Linked goals track the asset's balance; unlinked ones use currentAmount
  assetId: id.allow(null),
  currentAmount: Joi.number().min(0),
});

export const updateSavingsGoalSchema = Joi.object({
  name: Joi.string().trim().max(100),
  targetAmount: amount,
  targetDate: Joi.date().allow(null),
  assetId: id.allow(null),
  currentAmount: Joi.number().min(0),
  isActive: Joi.boolean(),
}).min(1);

export const getSavingsGoalsQuery = Joi.object({
  includeInactive: Joi.boolean(),
});
