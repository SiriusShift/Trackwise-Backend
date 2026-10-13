import multer from "multer";
import { AppError } from "../utils/AppError.js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

// Raster images only. SVG/HTML are deliberately excluded (script execution).
export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 30,
    fieldSize: 100 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
      return cb(new AppError("Only JPEG, PNG, WebP or GIF images are allowed", 400));
    }
    cb(null, true);
  },
});
