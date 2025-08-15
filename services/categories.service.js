const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const validateCategory = async (categoryId) => {
  const category = await prisma.categories.findFirst({
    where: {
      id: categoryId,
    },
  });

  if (!category) {
    throw new Error("Category not found"); 
  }
  return category
};

module.exports = {
  validateCategory
}