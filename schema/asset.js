import Joi from "joi";
import { currency } from "./common.js";

const assetTypes = ["CASH", "BANK", "CREDIT", "LOAN", "INVESTMENT"];

const assetSubtypes = [
  "SAVINGS",
  "CHECKING",
  "E_WALLET",
  "CREDIT_CARD",
  "LINE_OF_CREDIT",
  "PERSONAL",
  "HOME",
  "AUTO",
  "STOCK",
  "ETF",
  "CRYPTO",
  "MUTUAL_FUND",
  "BOND",
];

const creditDetailSchema = Joi.object({
  creditLimit: Joi.number().positive().required(),
  statementDate: Joi.number().integer().min(1).max(31).allow(null),
  dueDate: Joi.number().integer().min(1).max(31).allow(null),
});

const savingDetailSchema = Joi.object({
  targetAmount: Joi.number().positive().required(),
  targetDate: Joi.date().allow(null),
});

// Statements and bill reminders are generated from these two days, so a new
// card needs them (existing cards without them can still be edited).
const newCreditDetailSchema = creditDetailSchema.keys({
  statementDate: Joi.number().integer().min(1).max(31).required(),
  dueDate: Joi.number().integer().min(1).max(31).required(),
});

export const createAssetSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  balance: Joi.number().required(),
  type: Joi.string().valid(...assetTypes).required(),
  sub_type: Joi.string().valid(...assetSubtypes).allow(null, ""),
  currency: currency.required(),
  color: Joi.string().trim().allow(null, ""),
  includeNetWorth: Joi.boolean(),
  creditDetail: creditDetailSchema.when("type", {
    is: "CREDIT",
    then: newCreditDetailSchema.required(),
    otherwise: Joi.optional().allow(null),
  }),
  savingDetail: savingDetailSchema.allow(null),
});

export const updateAssetSchema = Joi.object({
  name: Joi.string().trim().max(100),
  color: Joi.string().trim().allow(null, ""),
  institution: Joi.string().trim().max(100).allow(null, ""),
  includeNetWorth: Joi.boolean(),
  creditDetail: creditDetailSchema.allow(null),
  savingDetail: savingDetailSchema.allow(null),
});
