const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createCategory = async (req, res, next) => {
  const { name, type } = req.body;
  const data = await prisma.category.create({
    data: {
      name,
      type,
    },
  });
  res.status(200).json({
    success: true,
    message: "Category created successfully",
    data: data,
  });
};

const getAllCategory = async (req, res, next) => {
  const { type } = req.query;

  try {
    // If type is not provided or is an empty string, don't apply the filter
    const categories = await prisma.category.findMany({
      where: type && type !== "" ? { type: type } : {}, // Only filter if 'type' is provided and not empty
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
