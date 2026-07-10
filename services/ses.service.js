import { SES } from "@aws-sdk/client-ses";
import "dotenv/config";
import { AppError } from "../utils/AppError.js";

const ses = new SES({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
  region: process.env.AWS_REGION,
});

/*
|--------------------------------------------------------------------------
| Verify Email Addresses (SES Identity Verification)
|--------------------------------------------------------------------------
*/
export const verifyEmailAddress = async (emails) => {
  try {
    if (!Array.isArray(emails)) {
      throw new AppError("Emails must be an array", 400);
    }

    const promises = emails.map((email) => {
      return ses.verifyEmailIdentity({
        EmailAddress: email,
      });
    });

    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error("Failed to verify email address:", err);
    return false;
  }
};

/*
|--------------------------------------------------------------------------
| Send Templated Email (SES)
|--------------------------------------------------------------------------
*/
export const sendEmail = async (email, data, template) => {
  const params = {
    Source: process.env.AWS_SES_SENDER || "your-email@example.com",
    Destination: {
      ToAddresses: [email],
    },
    Template: template,
    TemplateData: JSON.stringify(data),
  };

  try {
    const result = await ses.sendTemplatedEmail(params);
    console.log("Email sent:", result);
    return result;
  } catch (err) {
    console.error("Failed to send email:", err);
    throw err;
  }
};