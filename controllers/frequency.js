const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createFrequency = async (req, res, next) => {
    try {
        // Validate incoming data
        const frequencies = req.body;

        if (!Array.isArray(frequencies) || frequencies.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Request body must be a non-empty array of frequency objects",
            });
        }

        // Validate each object in the array
        for (const frequency of frequencies) {
            const { name, interval, unit } = frequency;
            if (!name || !interval || !unit) {
                return res.status(400).json({
                    success: false,
                    message: "Each frequency object must include 'name', 'interval', and 'unit'",
                });
            }
        }

        // Perform bulk create
        const data = await prisma.frequency.createMany({
            data: frequencies,
            skipDuplicates: true, // Optional: Skip duplicates if `name` is a unique constraint
        });

        // Send a success response
        res.status(200).json({
            success: true,
            message: "Frequencies created successfully",
            data: data,
        });
    } catch (err) {
        console.error("Error while creating frequencies:", err);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getAllFrequency = async (req, res, next) => {
    try {
        const data = await prisma.frequency.findMany();
        res.status(200).json({
            success: true,
            message: "Frequencies fetched successfully",
            data: data,
        });
    } catch (err) {
        console.error("Error while fetching frequencies:", err);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports = { createFrequency, getAllFrequency };