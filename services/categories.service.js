import { PrismaClient } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| Validate Category
|--------------------------------------------------------------------------
*/
export const validateCategory = async (categoryId) => {
  const id = Number(categoryId);

  if (!id) {
    throw new AppError("Invalid category ID", 400);
  }

  const category = await prisma.categories.findFirst({
    where: { id },
  });

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  return category;
};

export const createCategory = async (categories) => {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new AppError(
      "Categories should be a non-empty array.",
      400
    );
  }

  const result = await prisma.categories.createMany({
    data: categories,
    skipDuplicates: true,
  });

  return result;
};

export const getCategories = async (userId, type) => {
  const categories = await prisma.categories.findMany({
    where: {
      isActive: true,
      ...(type?.trim() && { type }),
      OR: [
        { userId: null },
        { userId: userId },
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

  return formattedCategories
}