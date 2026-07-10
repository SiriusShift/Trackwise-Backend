import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { AppError } from "../utils/AppError.js";

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

  let corrected = base64Image;

  if (!base64Image.startsWith("data:image/")) {
    corrected = `data:image/png;base64,${base64Image}`;
  }

  const match = corrected.match(/^data:(image\/\w+);base64,/);

  if (!match) {
    throw new AppError("Invalid base64 format", 400);
  }

  const fileType = match[1];
  const base64Data = corrected.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  const key = `${folder}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: fileType,
    ACL: "public-read",
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

  const key = `users/${userId}/${folder}/${file.originalname}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: "public-read",
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