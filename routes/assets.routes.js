import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  archiveAsset,
  createAsset,
  getAsset,
  updateAsset,
} from "../controllers/asset.controller.js";

import {
  requireAuth
} from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
  archiveAssetSchema,
  createAssetSchema,
  updateAssetSchema,
} from "../schema/asset.js";

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

router
  .route("/:id")
  .put(
    requireAuth,
    validate({ body: updateAssetSchema }),
    catchAsync(updateAsset),
  ).patch(
    requireAuth,
    validate({ body: archiveAssetSchema }),
    catchAsync(archiveAsset),
  );

export default router;