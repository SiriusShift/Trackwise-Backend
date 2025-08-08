const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const validateCategory = async (categoryId) => {
  const category = await prisma.categories.findFirst({
    where: {
      id: categoryId,
    },
  });

  if (!category) {
    return res.status(400).json({
      success: false,
      message: "Category not found",
    });
  }
  return category
};

module.exports = {
  validateCategory
}