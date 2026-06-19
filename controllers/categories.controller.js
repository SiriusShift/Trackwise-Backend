import { prisma } from "../config/prisma.js";

export const createCategory = async (req, res, next) => {
  try {
    console.log(req.body);
    const categories = req.body; // Expect an array of objects: [{ name, type }, ...]

    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid input: categories should be a non-empty array.",
      });
    }

    // Use Prisma's createMany to insert multiple categories at once
    const result = await prisma.categories.createMany({
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

export const getAllCategory = async (req, res, next) => {
  const { type } = req.query;
  const currentUserId = req.user.id
  try {
    // If type is not provided or is an empty string, don't apply the filter
    const categories = await prisma.categories.findMany({
      where: {
        isActive: true,
        ...(type?.trim() && { type }),
        OR: [
          { userId: null },
          { userId: currentUserId },
        ],
      },
      include: {
        categoriesTracker: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [
        { userId: "asc" },
        { name: "asc" },
      ],
    });

    const formattedCategories = categories.map(
      ({ categoriesTracker, ...category }) => ({
        ...category,
        hasTracker: categoriesTracker.length > 0,
      })
    );
    res.status(200).json({
      success: true,
      message: "Category fetched successfully",
      data: formattedCategories,
    });
  } catch (error) {
    // Handle any errors
    next(error);
  }
};