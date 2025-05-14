const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const createCategory = async (req, res, next) => {
  try {
    const categories = req.body.categories; // Expect an array of objects: [{ name, type }, ...]

    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid input: categories should be a non-empty array.",
      });
    }

    // Use Prisma's createMany to insert multiple categories at once
    const result = await prisma.category.createMany({
      data: categories,
      skipDuplicates: true, // Optional: Avoid errors if there are duplicates
    });

    res.status(200).json({
      success: true,
      message: "Categories created successfully",
      count: result.count, // Number of records inserted
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "An error occurred while creating categories.",
      error: error.message,
    });
  }
};

const getAllCategory = async (req, res, next) => {
  const { type } = req.query;

  try {
    // If type is not provided or is an empty string, don't apply the filter
    const categories = await prisma.category.findMany({
      where: {
        ...(type && type !== "" ? { type: type } : {}),
        isActive: true,
      }
    });

    res.status(200).json({
      success: true,
      message: "Category fetched successfully",
      data: categories,
    });
  } catch (error) {
    // Handle any errors
    next(error);
  }
};

module.exports = {
  createCategory,
  getAllCategory,
};
