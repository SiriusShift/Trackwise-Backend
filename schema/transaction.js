import Joi from "joi";
import { amount, description, id } from "./common.js";

/*
|--------------------------------------------------------------------------
| Expense / Income
|--------------------------------------------------------------------------
| Sent as multipart form-data, so values arrive as strings and are
| converted by Joi.
*/
const transactionFields = {
  amount: amount.required(),
  category: id.required(),
  date: Joi.date().required(),
  description: description.required(),
};

export const createExpenseSchema = Joi.object({
  ...transactionFields,
  account: id,
});

export const updateExpenseSchema = createExpenseSchema.keys({
  // Existing image URL; omitting it removes the current image
  image: Joi.string().allow("", null),
});

export const createIncomeSchema = Joi.object({
  ...transactionFields,
  account: id.required(),
});

export const updateIncomeSchema = createIncomeSchema.keys({
  image: Joi.string().allow("", null),
});

/*
|--------------------------------------------------------------------------
| Transfer
|--------------------------------------------------------------------------
*/
export const createTransferSchema = Joi.object({
  ...transactionFields,
  account: id.required(),
  to: id.required().invalid(Joi.ref("account")).messages({
    "any.invalid": "Destination account must be different from source account.",
  }),
});

export const updateTransferSchema = createTransferSchema.keys({
  image: Joi.string().allow("", null),
});

export const transferPaymentSchema = Joi.object({
  amount: amount.required(),
  from: id.required(),
  date: Joi.date().required(),
  description,
});

/*
|--------------------------------------------------------------------------
| Bills
|--------------------------------------------------------------------------
*/
export const billPaymentSchema = createExpenseSchema;

/*
|--------------------------------------------------------------------------
| History
|--------------------------------------------------------------------------
*/
export const editHistorySchema = Joi.object({
  amount: amount.required(),
  date: Joi.date().required(),
  description,
});

export const archiveTransactionQuery = Joi.object({
  type: Joi.string().valid("expense", "income", "transfer").required(),
});

/*
|--------------------------------------------------------------------------
| Recurring
|--------------------------------------------------------------------------
*/
const types = ["Expense", "Income", "Transfer"];
const units = ["day", "week", "month", "year"];
const behaviours = ["AUTO_LOG", "REMIND"];

export const createRecurringSchema = Joi.object({
  type: Joi.string().valid(...types).required(),
  amount: amount.required(),
  category: id.required(),
  description: description.required(),
  date: Joi.date().required(),
  endDate: Joi.date().min(Joi.ref("date")).allow(null),
  every: Joi.number().integer().positive().required(),
  frequency: Joi.string().valid(...units).required(),
  behaviour: Joi.string().valid(...behaviours).required(),
  account: id.when("type", {
    is: Joi.valid("Expense", "Transfer"),
    then: Joi.required(),
  }),
  to: Joi.alternatives()
    .try(id, Joi.object({ id: id.required() }).unknown())
    .when("type", {
      is: Joi.valid("Income", "Transfer"),
      then: Joi.required(),
    }),
});
