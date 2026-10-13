import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";

/*
|--------------------------------------------------------------------------
| Find an active limit owned by the user
|--------------------------------------------------------------------------
*/
const findOwnedLimit = async (userId, limitId) => {
  const id = Number(limitId);

  if (!id) {
    throw new AppError("Expense limit not found", 400);
  }

  const limit = await prisma.categoryTracker.findFirst({
    where: { id, userId: Number(userId), isActive: true },
  });

  if (!limit) {
    throw new AppError("Expense limit not found", 404);
  }

  return limit;
};

export const addExpenseLimit = async (userId, { amount, categoryId, period }) => {
  const existing = await prisma.categoryTracker.findFirst({
    where: {
      categoryId,
      userId: Number(userId),
      period,
      isActive: true,
    },
  });

  if (existing) {
    throw new AppError("Expense limit already exists for this category", 400);
  }

  return prisma.categoryTracker.create({
    data: {
      limit: amount,
      period,
      category: { connect: { id: categoryId } },
      user: { connect: { id: Number(userId) } },
    },
  });
};

export const getAllExpenseLimit = async (userId, startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const categoryTracker = await prisma.categoryTracker.findMany({
    where: {
      userId: Number(userId),
      isActive: true,
      limit: { not: null },
    },
    select: {
      id: true,
      limit: true,
      period: true,
      category: {
        select: {
          id: true,
          name: true,
          icon: true,
          expenses: {
            where: {
              isActive: true,
              userId: Number(userId),
              date: { gte: start, lte: end },
            },
            select: {
              id: true,
              description: true,
              amount: true,
              date: true,
            },
          },
        },
      },
    },
  });

  return categoryTracker.map(({ id, category, limit, period }) => {
    const total =
      category?.expenses?.reduce(
        (acc, expense) => acc + Number(expense.amount),
        0,
      ) || 0;

    return {
      id,
      category,
      value: Number(limit),
      total,
      period,
    };
  });
};

export const updateExpenseLimit = async (userId, limitId, amount) => {
  const limit = await findOwnedLimit(userId, limitId);

  return prisma.categoryTracker.update({
    where: { id: limit.id },
    data: { limit: amount },
  });
};

export const deleteExpenseLimit = async (userId, limitId) => {
  const limit = await findOwnedLimit(userId, limitId);

  return prisma.categoryTracker.update({
    where: { id: limit.id },
    data: { isActive: false },
  });
};
