import * as AIService from "../services/ai.services.js";
import { AppError } from "../utils/AppError.js";

export const scanReceipt = async (req, res) => {
    if (!req.file) {
        throw new AppError("Image is required (form-data field: image)", 400);
    }

    const data = await AIService.scanReceipt(req.file, req.user.id);

    return res.status(200).json({
        success: true,
        message: "Receipt scanned successfully",
        data,
    });
};
