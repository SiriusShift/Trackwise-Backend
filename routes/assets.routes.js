import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  createAsset,
  getAsset,
} from "../controllers/asset.controller.js";

import {
  requireAuth
} from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { createAssetSchema } from "../schema/asset.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Asset Routes
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .post(
    requireAuth,
    validate({ body: createAssetSchema }),
    catchAsync(createAsset),
  )
  .get(
    requireAuth,
    catchAsync(getAsset),
  );

export default router;