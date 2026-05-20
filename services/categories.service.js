import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| Validate Category
|--------------------------------------------------------------------------
*/
export const validateCategory = async (categoryId) => {
  const id = Number(categoryId);

  if (!id) {
    throw new Error("Invalid category ID");
  }

  const category = await prisma.categories.findFirst({
    where: { id },
  });

  if (!category) {
    throw new Error("Category not found");
  }

  return category;
};