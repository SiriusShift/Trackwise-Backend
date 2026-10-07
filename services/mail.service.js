import "dotenv/config";
import nodemailer from "nodemailer";
import { AppError } from "../utils/AppError.js";
import emailTemplate from "../emailTemplate.json" with { type: "json" };
import resetTemplate from "../resetPassword.json" with { type: "json" };

const templates = {
    Verification_Code: emailTemplate.Template,
    Reset_Password: resetTemplate.Template,
};

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

export const sendEmail = async (email, data, templateName) => {
    if (!email || !email.includes("@")) {
        throw new AppError("Invalid email address provided.", 400);
    }

    const template = templates[templateName];

    if (!template) {
        throw new AppError(`Email template "${templateName}" not found.`, 500);
    }

    const html = template.HtmlPart.replace(/{{(\w+)}}/g, (_, key) => data[key] ?? "");
    const subject = template.SubjectPart.replace(/{{(\w+)}}/g, (_, key) => data[key] ?? "");

    try {
        const result = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject,
            html,
        });
        console.log("✅ Email sent successfully:", result.response);
    } catch (err) {
        console.error("❌ Failed to send email:", err.message);
        throw err;
    }
};

export const verifyEmailAddress = async () => true;
