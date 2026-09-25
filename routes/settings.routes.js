import { Router } from "express";
import {
  getSettings,
  updateSettings,
} from "../controllers/settings.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { updateSettingsSchema } from "../schema/settings.js";
import catchAsync from "../utils/catchAsync.js";

const router = Router();

router
  .route("/")
  .get(requireAuth, catchAsync(getSettings))
  .patch(
    requireAuth,
    validate({ body: updateSettingsSchema }),
    catchAsync(updateSettings),
  );

export default router;
