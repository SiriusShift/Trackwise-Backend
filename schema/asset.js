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
    then: Joi.required(),
    otherwise: Joi.optional().allow(null),
  }),
});
