const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
  region: process.env.AWS_REGION,
});

const uploadBase64ToS3 = async (base64Image, fileName, folder) => {
  try {
    let correctedBase64 = base64Image;
    const checkFormat = base64Image.startsWith("data:image/");
    if (!checkFormat) {
      correctedBase64 = `data:image/png;base64,${base64Image}`;
    }
    if (!correctedBase64 || typeof correctedBase64 !== "string") {
      throw new Error("Invalid base64 image string");
    }

    // Extract MIME type
    const match = correctedBase64.match(/^data:(image\/\w+);base64,/);
    if (!match) {
      throw new Error("Base64 format is incorrect");
    }
    const fileType = match[1];

    // Remove the base64 prefix
    const base64Data = correctedBase64.replace(/^data:image\/\w+;base64,/, "");

    // Convert to Buffer
    const imageBuffer = Buffer.from(base64Data, "base64");
    console.log("34: ", imageBuffer);

    // Upload parameters
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${folder}/${fileName}`,
      Body: imageBuffer,
      ContentType: fileType,
      ACL: "public-read", // Optional: makes the image public
    };

    // Upload to S3
    const command = new PutObjectCommand(uploadParams);
    const response = await s3.send(command);
    console.log("S3 Upload Success:", response);

    // Return the S3 URL
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${fileName}`;
  } catch (error) {
    console.error("S3 Upload Error:", error.message);
    throw new Error("Failed to upload image to S3");
  }
};

const uploadFileToS3 = async (file, folder, id) => {
  const key = `users/${id}/${folder}/${file.originalname}`;

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key, // ✅ correct path
    Body: file.buffer,
    ContentType: file.mimetype, // Optional: helps S3 serve the file properly
    ACL: "public-read", // Optional: make file publicly accessible
  };

  try {
    const command = new PutObjectCommand(params);
    const response = await s3.send(command);
    console.log("S3 Upload Success:", response);

    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    console.error(error);
    alert("Error uploading file: " + error.message);
    return null;
  }
};

module.exports = {
  uploadBase64ToS3,
  uploadFileToS3,
};
