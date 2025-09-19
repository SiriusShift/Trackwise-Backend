const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { validateCategory } = require("./categories.service");
const { uploadFileToS3, deleteFileFromS3 } = require("./s3.service");
const { validateAsset } = require("./assets.service");

const validateIncome = async (id) => {
  const income = prisma.income.findFirst({
    where: {
      id: parseInt(id),
    },
  });
  if (!income) {
    throw new Error("Income not found"); // ❌ Throw error here
  }

  return income;
};
const postIncome = async (userId, data, file) => {
  const amount = parseInt(data.amount);
  const categoryId = parseInt(data.category);
  const assetId = parseInt(data.to);

  validateCategory(categoryId);
  validateAsset(assetId, userId);

  const image = file ? await uploadFileToS3(file, "Income", userId) : null;
  const income = await prisma.income.create({
    data: {
      date: data?.date,
      category: {
        connect: {
          id: categoryId,
        },
      },
      description: data?.description,
      amount: amount,
      asset: {
        connect: {
          id: assetId,
        },
      },
      image: image,
      user: {
        connect: {
          id: userId,
        },
      },
      status: new Date(data?.date) > new Date() ? "Pending" : "Received",
    },
  });
  console.log("income-", income);
  if (new Date(data?.date) <= new Date()) {
    await prisma.transactionHistory.create({
      data: {
        income: {
          connect: {
            id: income.id,
          },
        },
        user: {
          connect: {
            id: userId,
          },
        },
        fromAsset: {
          connect: {
            id: assetId,
          },
        },
        transactionType: "Income",
        amount: amount,
        description: data.description,
        date: data.date,
      },
    });
  }
  return income;
};

const getIncome = async (userId, query) => {
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
    isActive: true,
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

  const totalCount = await prisma.income.count({ where: filters });

  const incomes = await prisma.expense.findMany({
    where: filters,
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      category: {
        select: {
          id: true,
          name: true,
          type: true,
          icon: true,
          isActive: true,
        },
      },
      asset: {
        select: {
          id: true,
          name: true,
          balance: true,
        },
      },
      description: true,
      amount: true,
      image: true,
      isActive: true,
      status: true,
      recurringTemplate: {
        select: {
          toAssetId: true,
          amount: true,
          // isVariable: true,
          auto: true,
        },
      },
      transactionHistory: {
        select: {
          id: true,
          transactionType: true,
          amount: true,
          description: true,
          date: true,
          fromAssetId: true,
        },
      },
    },
    skip,
    take: size,
  });

  const filteredIncomes = incomes.filter((item) => item !== undefined);
  const incomeWithBalance = filteredIncomes?.map((expense) => ({
    ...expense,
    remainingBalance:
      expense.amount -
      expense.transactionHistory.reduce(
        (acc, curr) => acc + (curr?.amount || 0),
        0
      ),
  }));
  console.log(filteredIncomes);

  const totalPages = Math.ceil(totalCount / size);

  return {
    data: filteredIncomes,
    totalCount,
    totalPages,
  };
};

const updateIncome = async (userId, data, file, id) => {
  console.log("params:", id);
  console.log("category id", data);

  try {
    const amount = parseInt(data?.amount);
    const categoryId = parseInt(data.category);
    const assetId = parseInt(data.to);

    const income = validateIncome(id);
    let image;

    if (file) {
      image = await uploadFileToS3(file, "Income", userId);
      if (income?.image) {
        await deleteFileFromS3(income?.image);
      }
    } else if (data?.image) {
      image = income?.image;
    } else {
      image = await deleteFileFromS3(income?.image);
    }

    const incomeUpdate = await prisma.income.update({
      where: { id: parseInt(id) },
      data: {
        amount: amount,
        description: data.description,
        recurring: data.recurring,
        image: image,
        status:
          new Date(data.date).getTime() > Date.now() ? "Pending" : "Received",
        category: {
          connect: {
            id: categoryId,
          },
        },
        asset: {
          connect: {
            id: assetId,
          },
        },
        date: data.date,
        updatedAt: new Date(),
        user: {
          connect: {
            id: userId,
          },
        },
      },
    });

    // Fetch the transaction history record related to the expense
    const transaction = await prisma.transactionHistory.findFirst({
      where: { incomeId: parseInt(id) }, // Ensure expenseId is properly converted to an integer
    });

    await prisma.transactionHistory.update({
      where: { id: parseInt(transaction?.id) },
      data: {
        amount: parseInt(data.amount),
        description: data.description,
        date: data.date,
        updatedAt: new Date(),
        toAsset: {
          connect: {
            id: assetId,
          },
        },
      },
    });

    console.log("return");

    return incomeUpdate;
  } catch (err) {
    console.log(err);
    throw new Error("Internal server error");
  }
};

const deleteIncome = async (id) => {
  validateIncome(id);

  await prisma.income.update({
    where: {
      id: id,
    },
    data: {
      isActive: false,
    },
  });

  await prisma.transactionHistory.update({
    where: { expenseId: parseInt(id) },
    data: { isActive: false },
  });

  return;
};

const getIncomeGraph = async (userId, query) => {
  const { startDate, endDate, mode } = query;

  try {
    const filters = {
      userId: parseInt(userId),
      date: {
        gte: startDate,
        lte: endDate,
      },
      isActive: true,
    };
    console.log("filters", filters);
    const groupedIncomes = await prisma.$queryRawUnsafe(
      `SELECT 
        date_trunc('${mode}', "date") AS "${mode}",
        sum(amount) AS total
      FROM "Income"
      WHERE "date" >= '${startDate}'::timestamp AND "date" <= '${endDate}'::timestamp AND "isActive" = true AND "status" = 'Received'
      GROUP BY "${mode}"
      ORDER BY "${mode}"`
    );
    console.log("group income!", groupedIncomes);

    const trend = (
      ((groupedIncomes[1]?.total - groupedIncomes[0]?.total) /
        groupedIncomes[0]?.total) *
      100
    ).toFixed(2);

    const categoryIncomes = await prisma.income.groupBy({
      by: ["categoryId"],
      where: filters,
      _sum: { amount: true },
    });

    const detailedCategoryIncomes = await Promise.all(
      categoryIncomes.map(async (item) => {
        const category = await prisma.categories.findFirst({
          where: { id: item.categoryId },
        });
        return {
          categoryId: item.categoryId,
          categoryName: category?.name || "Unknown",
          total: item._sum.amount || 0,
        };
      })
    );

    console.log("detailed category", detailedCategoryIncomes);

    const totalIncome = await prisma.income.aggregate({
      where: filters,
      _sum: { amount: true },
    });

    return {
      trend,
      data: detailedCategoryIncomes,
      total: totalIncome._sum.amount || 0,
    };
  } catch (err) {
    console.log(err);
    throw new Error("Internal server error");
  }
};

module.exports = {
  postIncome,
  getIncome,
  updateIncome,
  deleteIncome,
  getIncomeGraph,
};
