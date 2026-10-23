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
  // Alternative to dueDate: due this many days after the statement date
  dueDaysAfterStatement: Joi.number().integer().min(1).max(60).allow(null),
});

// Optional goal set while creating a savings account. Goals are managed in
// the savings goals API afterwards; the amount and date only make sense
// together.
const accountSavingsGoalSchema = Joi.object({
  targetAmount: Joi.number().positive().allow(null),
  targetDate: Joi.date().allow(null),
}).custom((value, helpers) => {
  const hasAmount = value.targetAmount != null;
  const hasDate = value.targetDate != null;
  if (hasAmount !== hasDate) {
    return helpers.message(
      "Set both a target amount and a target date, or leave both empty",
    );
  }
  return value;
});

// Statements and bill reminders are generated from the statement day plus one
// due rule (a day of the month, or days after the statement date), so a new
// card needs them (existing cards without them can still be edited).
const newCreditDetailSchema = creditDetailSchema
  .keys({
    statementDate: Joi.number().integer().min(1).max(31).required(),
  })
  .custom((value, helpers) => {
    if (!value.dueDate && !value.dueDaysAfterStatement) {
      return helpers.message(
        "Set a due day or the number of days after the statement date",
      );
    }
    return value;
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
  savingsGoal: accountSavingsGoalSchema.allow(null),
});

export const updateAssetSchema = Joi.object({
  name: Joi.string().trim().max(100),
  color: Joi.string().trim().allow(null, ""),
  institution: Joi.string().trim().max(100).allow(null, ""),
  includeNetWorth: Joi.boolean(),
  creditDetail: creditDetailSchema.allow(null),
});
