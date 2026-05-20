import { Router } from "express";

import catchAsync from "../utils/catchAsync.js";

import {
  createAsset,
  getAsset,
} from "../controllers/asset.controller.js";

import {
  isLoggedIn,
  validateCreateRequest,
} from "../middleware/validate.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Asset Routes
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .post(
    isLoggedIn,
    // validateCreateRequest,
    catchAsync(createAsset),
  )
  .get(
    isLoggedIn,
    catchAsync(getAsset),
  );

export default router;