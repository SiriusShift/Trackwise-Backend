import moment from "moment-timezone";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as reportsService from "../services/reports.service.js";
import { AppError } from "../utils/AppError.js";
import { getUserTimezone } from "../utils/userTimezone.js";

const VALID_FORMATS = ["json", "csv", "excel"];

export const getTransactionStatement = asyncHandler(
    async (req, res) => {
        const { assetId, from, to, format = "json" } = req.query;

        if (!assetId || !from || !to) {
            throw new AppError(
                "assetId, from, and to are required query parameters",
                400
            );
        }

        if (!VALID_FORMATS.includes(format)) {
            throw new AppError(
                `format must be one of: ${VALID_FORMATS.join(", ")}`,
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
        const timezone = await getUserTimezone(userId);

        const statement = await reportsService.getTransactionStatement({
            userId,
            assetId: parsedAssetId,
            from: fromDate,
            to: toDate,
            format,
            timezone,
        });

        const filenameBase = `Transaction-Statement_${parsedAssetId}_${moment.tz(fromDate, timezone).format("YYYY-MM-DD")}_to_${moment.tz(toDate, timezone).format("YYYY-MM-DD")}`;
        if (format === "excel") {
            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filenameBase}.xlsx"`
            );
            return res.send(statement);
        }

        if (format === "csv") {
            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filenameBase}.csv"`
            );
            return res.send(statement);
        }

        return res.status(200).json({
            success: true,
            data: statement,
        });
    }
);

export const getCreditStatementList = asyncHandler(
    async (req, res) => {
        const assetId = Number(req.query.assetId);
        if (!req.query.assetId || Number.isNaN(assetId)) {
            throw new AppError("assetId must be a valid number", 400);
        }

        const userId = req.user.id;
        const timezone = await getUserTimezone(userId);
        const statements = await reportsService.getCreditStatementList({ userId, assetId, timezone });

        return res.status(200).json({
            success: true,
            data: statements,
        });
    }
);

export const getCreditCardStatement = asyncHandler(
    async (req, res) => {
        const { statementId, format = "json" } = req.query;

        const parsedStatementId = Number(statementId);
        if (!statementId || Number.isNaN(parsedStatementId)) {
            throw new AppError("statementId must be a valid number", 400);
        }

        if (!VALID_FORMATS.includes(format)) {
            throw new AppError(
                `format must be one of: ${VALID_FORMATS.join(", ")}`,
                400
            );
        }

        const userId = req.user.id;
        const timezone = await getUserTimezone(userId);

        const statement = await reportsService.getCreditCardStatement({
            userId,
            statementId: parsedStatementId,
            format,
            timezone,
        });

        const filenameBase = `Credit-Card-Statement_${parsedStatementId}`;
        if (format === "excel") {
            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filenameBase}.xlsx"`
            );
            return res.send(statement);
        }

        if (format === "csv") {
            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filenameBase}.csv"`
            );
            return res.send(statement);
        }

        return res.status(200).json({
            success: true,
            data: statement,
        });
    }
);

export const getMoneyFlowStatement = asyncHandler(
    async (req, res) => {
        const { from, to, format = "json" } = req.query;

        if (!from || !to) {
            throw new AppError(
                "from and to are required query parameters",
                400
            );
        }

        if (!VALID_FORMATS.includes(format)) {
            throw new AppError(
                `format must be one of: ${VALID_FORMATS.join(", ")}`,
                400
            );
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
        const timezone = await getUserTimezone(userId);

        const statement = await reportsService.getMoneyFlowStatement({
            userId,
            from: fromDate,
            to: toDate,
            format,
            timezone,
        });

        const filenameBase = `Money-Flow_${moment.tz(fromDate, timezone).format("YYYY-MM-DD")}_to_${moment.tz(toDate, timezone).format("YYYY-MM-DD")}`;
        if (format === "excel") {
            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filenameBase}.xlsx"`
            );
            return res.send(statement);
        }

        if (format === "csv") {
            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filenameBase}.csv"`
            );
            return res.send(statement);
        }

        return res.status(200).json({
            success: true,
            data: statement,
        });
    }
);