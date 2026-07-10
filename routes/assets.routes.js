import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  createAsset,
  getAsset,
} from "../controllers/asset.controller.js";

import {
  requireAuth
} from "../middleware/requireAuth.js";

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
    // validateCreateRequest,
    catchAsync(createAsset),
  )
  .get(
    requireAuth,
    catchAsync(getAsset),
  );

export default router;