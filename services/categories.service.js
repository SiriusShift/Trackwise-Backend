import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";

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

export const createCategory = async (userId, categories, isAdminMode) => {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new AppError("Categories should be a non-empty array.", 400);
  }

  const names = [...new Set(categories.map((c) => c.name.trim()))];

  const existing = await prisma.categories.findMany({
    where: {
      name: { in: names },
      OR: [{ userId: null }, { userId }],
    },
    select: { name: true, type: true },
  });

  const taken = new Set(
    existing.map((c) => `${c.type}:${c.name.toLowerCase()}`),
  );

  // Drops categories that already exist, and duplicates within the request
  const unique = categories.filter((c) => {
    const key = `${c.type}:${c.name.trim().toLowerCase()}`;
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });

  if (unique.length === 0) {
    throw new AppError("Category already exists.", 409);
  }

  const result = await prisma.categories.createMany({
    data: unique.map((category) => ({
      ...category,
      ...(isAdminMode ? {} : { userId }),
    })),
    skipDuplicates: true,
  });

  return result;
};

export const getCategories = async (userId, type) => {
  const categories = await prisma.categories.findMany({
    where: {
      isActive: true,
      ...(type?.trim() && { type }),
      OR: [{ userId: null }, { userId: userId }],
    },
    include: {
      categoriesTracker: {
        where: { userId, isActive: true }, // add this

        select: {
          id: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ userId: "asc" }, { name: "asc" }],
  });

  const formattedCategories = categories.map(
    ({ categoriesTracker, ...category }) => ({
      ...category,
      hasTracker: categoriesTracker.length > 0,
    }),
  );

  return formattedCategories;
};
