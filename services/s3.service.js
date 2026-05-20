import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

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
  try {
    if (!base64Image || typeof base64Image !== "string") {
      throw new Error("Invalid base64 image string");
    }

    let corrected = base64Image;

    if (!base64Image.startsWith("data:image/")) {
      corrected = `data:image/png;base64,${base64Image}`;
    }

    const match = corrected.match(/^data:(image\/\w+);base64,/);

    if (!match) {
      throw new Error("Invalid base64 format");
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
  } catch (err) {
    console.error("uploadBase64ToS3 error:", err);
    throw new Error("Failed to upload image to S3");
  }
};

/*
|--------------------------------------------------------------------------
| Upload File (multer buffer) to S3
|--------------------------------------------------------------------------
*/
export const uploadFileToS3 = async (file, folder, userId) => {
  try {
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
  } catch (err) {
    console.error("uploadFileToS3 error:", err);
    throw new Error("Error uploading file to S3");
  }
};

/*
|--------------------------------------------------------------------------
| Delete File from S3
|--------------------------------------------------------------------------
*/
export const deleteFileFromS3 = async (url) => {
  try {
    if (!url) return;

    const bucket = process.env.AWS_S3_BUCKET_NAME;

    const key = url.split(
      `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/`
    )[1];

    if (!key) {
      throw new Error("Invalid S3 URL");
    }

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await s3.send(command);

    return true;
  } catch (err) {
    console.error("deleteFileFromS3 error:", err);
    throw new Error("Error deleting file from S3");
  }
};