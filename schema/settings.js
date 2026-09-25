import Joi from "joi";

export const updateSettingsSchema = Joi.object({
  timezone: Joi.string().trim(),
  timeFormat: Joi.string().trim(),
  currency: Joi.string().trim().uppercase().length(3),
  weekStartDay: Joi.number().integer().min(0).max(6),
  recurringBehaviour: Joi.string().valid("AUTO_LOG", "REMIND"),
  emailNotification: Joi.boolean(),
  mobileNotification: Joi.boolean(),
  notifyDays: Joi.number().integer().min(0),
  first_name: Joi.string().trim(),
  last_name: Joi.string().trim(),
  email: Joi.string().trim().email(),
  phone_number: Joi.string().trim().allow(""),
})
  .prefs({ stripUnknown: true })
  .min(1)
  .messages({ "object.min": "At least one setting must be provided." });
