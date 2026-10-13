import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "../middleware/upload.js";
import { AppError } from "../utils/AppError.js";

// Detect the real image type from magic bytes; never trust client-supplied type.
const sniffImageType = (buf) => {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  const head = buf.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
};

const validateImageBuffer = (buffer) => {
  if (!buffer || buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError("Invalid image size (max 5 MB)", 400);
  }
  const type = sniffImageType(buffer);
  if (!type || !ALLOWED_IMAGE_TYPES[type]) {
    throw new AppError("Only JPEG, PNG, WebP or GIF images are allowed", 400);
  }
  return type;
};

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
  region: process.env.AWS_REGION,
});

/*
|--------------------------------------------------------------------------
| Upload Base64 Image to S3
|--------------------------------------------------------------------------
*/
export const uploadBase64ToS3 = async (base64Image, fileName, folder) => {
  if (!base64Image || typeof base64Image !== "string") {
    throw new AppError("Invalid base64 image string", 400);
  }

  const base64Data = base64Image.replace(/^data:image\/[\w.+-]+;base64,/, "");
  if (base64Data.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4) {
    throw new AppError("Invalid image size (max 5 MB)", 400);
  }
  const buffer = Buffer.from(base64Data, "base64");
  const fileType = validateImageBuffer(buffer);

  const key = `${folder}/${randomUUID()}.${ALLOWED_IMAGE_TYPES[fileType]}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: fileType,
    ACL: "public-read",
    ContentDisposition: "inline",
    CacheControl: "public, max-age=31536000, immutable",
  });

  await s3.send(command);

  return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

/*
|--------------------------------------------------------------------------
| Upload File (multer buffer) to S3
|--------------------------------------------------------------------------
*/
export const uploadFileToS3 = async (file, folder, userId) => {

  const fileType = validateImageBuffer(file.buffer);
  const key = `users/${userId}/${folder}/${randomUUID()}.${ALLOWED_IMAGE_TYPES[fileType]}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: fileType,
    ACL: "public-read",
    ContentDisposition: "inline",
    CacheControl: "public, max-age=31536000, immutable",
  });

  await s3.send(command);

  return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

};

/*
|--------------------------------------------------------------------------
| Delete File from S3
|--------------------------------------------------------------------------
*/
export const deleteFileFromS3 = async (url) => {
  if (!url) return;

  const bucket = process.env.AWS_S3_BUCKET_NAME;

  const key = url.split(
    `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/`
  )[1];

  if (!key) {
    throw new AppError("Invalid S3 URL", 400);
  }

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3.send(command);

  return true;
};