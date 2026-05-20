import nodemailer from "nodemailer";
import "dotenv/config";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // Maileroo SMTP host
  port: process.env.SMTP_PORT, // 587 (TLS)
  secure: false, // use TLS, not SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV !== "development",
  },
});

export const sendEmail = async (email, otp, subject) => {
  console.log("Email passed:", email);

  if (!email || !email.includes("@")) {
    console.error("Invalid email format detected!");
    throw new Error("Invalid email address provided.");
  }

  const mailOptions = {
    from: `${process.env.EMAIL_USER}`,
    to: email,
    subject: subject,
    html: compileTemplate(otp),
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", result.response);
  } catch (err) {
    console.error("❌ Failed to send email:", err.message);
  }
};

// Dummy template compiler (replace with your logic)
const compileTemplate = (otp) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
      <h2 style="color: #333;">Your OTP Code</h2>
      <p style="font-size: 16px; color: #555;">Use the following OTP code to proceed:</p>
      <p style="font-size: 28px; font-weight: bold; color: #000; letter-spacing: 4px; text-align: center;">${otp}</p>
      <p style="font-size: 14px; color: #777;">This code is valid for the next 5 minutes. If you didn’t request this code, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
      <p style="font-size: 12px; color: #888;">Thanks,<br/>PathAlert Team</p>
    </div>
  `;
};



// const {
//     SES
// } = require("@aws-sdk/client-ses");
// require('dotenv').config();

// const ses = new SES({
//     credentials: {
//         accessKeyId: process.env.AWS_ACCESS_KEY,
//         secretAccessKey: process.env.AWS_SECRET_KEY
//     },

//     region: process.env.AWS_REGION
// });

// const sendEmail = async (email, data, template) => {
//     console.log("Email passed:", email);
//     console.log("Data passed:", data);
//     console.log("Template name:", template);

//     if (!email || !email.includes("@")) {
//         console.error("Invalid email format detected!");
//         throw new Error("Invalid email address provided.");
//     }

//     const params = {
//         Source: "pathalertdev@gmail.com", // Ensure this is verified in SES
//         Template: template,
//         Destination: {
//             ToAddresses: [email],
//         },
//         TemplateData: JSON.stringify(data),
//     };

//     try {
//         const result = await ses.sendTemplatedEmail(params);
//         console.log("Email sent successfully:", result);
//     } catch (err) {
//         console.error("Failed to send email:", err);
//     }
// };

// module.exports = { sendEmail };
