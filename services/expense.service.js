const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const moment = require("moment");

const getExpenses = async (userId, query) => {
  const {
    search,
    pageIndex,
    pageSize,
    Categories,
    startDate,
    endDate,
    status,
  } = query;

  const page = parseInt(pageIndex) >= 0 ? parseInt(pageIndex) + 1 : 1;
  const size = parseInt(pageSize) > 0 ? parseInt(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: parseInt(userId),
    ...(startDate && endDate
      ? {
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }
      : {}),
    isDeleted: false,
  };

  if (search) {
    filters.description = {
      startsWith: search,
      mode: "insensitive",
    };
  }

  if (status) {
    filters.status = {
      startsWith: status,
    };
  }

  if (Categories !== undefined) {
    filters.categoryId = {
      in: JSON.parse(Categories),
    };
  }

  const totalCount = await prisma.expense.count({ where: filters });

  const expenses = await prisma.expense.findMany({
    where: filters,
    orderBy: { date: "desc" },
    skip,
    take: size,
  });

  const detailedExpenses = await Promise.all(
    expenses.map(async (expense) => {
      if (expense?.sourceId !== null) {
        const asset = await prisma.asset.findFirst({
          where: { id: expense.sourceId },
        });
        const category = await prisma.categories.findFirst({
          where: { id: expense.categoryId },
        });
        return { ...expense, asset, category };
      }
      return undefined;
    })
  );

  const filteredExpenses = detailedExpenses.filter(
    (item) => item !== undefined
  );

  const totalPages = Math.ceil(totalCount / size);

  return {
    data: filteredExpenses,
    totalCount,
    totalPages,
  };
};

module.exports = {
  getExpenses,
};
