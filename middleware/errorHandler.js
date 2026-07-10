import { Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError.js";

export const errorHandler = (err, req, res, next) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            ...(err.details && { details: err.details }),
        });
    }

    // Common Prisma errors mapped to sensible HTTP codes
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
            return res.status(404).json({ success: false, message: "Record not found" });
        }
        if (err.code === "P2002") {
            return res.status(409).json({
                success: false,
                message: `Duplicate value for field: ${err.meta?.target}`,
            });
        }
    }

    // Database is unreachable at all (wrong URL, DB down, network issue, etc.)
    if (err instanceof Prisma.PrismaClientInitializationError) {
        console.error("Database connection failed:", err.message);
        return res.status(503).json({
            success: false,
            message: "Database is currently unavailable. Please try again later.",
        });
    }

    // Query took too long / connection dropped mid-query
    if (err instanceof Prisma.PrismaClientRustPanicError) {
        console.error("Prisma engine crashed:", err.message);
        return res.status(503).json({
            success: false,
            message: "Database engine error. Please try again later.",
        });
    }

    // Validation errors — e.g. wrong data type passed to a Prisma query
    if (err instanceof Prisma.PrismaClientValidationError) {
        return res.status(400).json({
            success: false,
            message: "Invalid data passed to database query",
        });
    }

    // Unexpected/programmer errors — log full detail, hide it from the client
    console.error("Unhandled error:", err);

    return res.status(500).json({
        success: false,
        message: "Something went wrong",
        ...(process.env.NODE_ENV !== "production" && { error: err.message }),
    });
};