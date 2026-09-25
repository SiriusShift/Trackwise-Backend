import { Router } from "express";
import multer from "multer";
import {
  getSettings,
  updateSettings,
} from "../controllers/settings.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { updateSettingsSchema } from "../schema/settings.js";
import catchAsync from "../utils/catchAsync.js";

const router = Router();

const upload = multer();

router
  .route("/")
  .get(requireAuth, catchAsync(getSettings))
  .patch(
    requireAuth,
    upload.single("image"),
    validate({ body: updateSettingsSchema }),
    catchAsync(updateSettings),
  );

export default router;
