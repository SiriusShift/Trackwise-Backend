import { asyncHandler } from "../middleware/asyncHandler.js";
import * as reportsService from "../services/reports.service.js";
import { AppError } from "../utils/AppError.js";

export const getTransactionStatement = asyncHandler(
    async (req, res) => {
        const { assetId, from, to } = req.query;

        if (!assetId || !from || !to) {
            throw new AppError(
                "assetId, from, and to are required query parameters",
                400
            );
        }

        const parsedAssetId = Number(assetId);
        if (Number.isNaN(parsedAssetId)) {
            throw new AppError("assetId must be a valid number", 400);
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            throw new AppError("from and to must be valid dates", 400);
        }

        if (fromDate > toDate) {
            throw new AppError("from date must be before to date", 400);
        }

        const userId = req.user.id; // adjust to however you attach the authed user

        console.log(userId, parsedAssetId, "user id")

        const statement = await reportsService.getTransactionStatement({
            userId,
            assetId: parsedAssetId,
            from: fromDate,
            to: toDate,
        });

        res.status(200).json({
            success: true,
            data: statement,
        });
    }
);