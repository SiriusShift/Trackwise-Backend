const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { validateCategory } = require("./categories.service");
const { uploadFileToS3, deleteFileFromS3 } = require("./s3.service");
const { validateAsset } = require("./assets.service");
const moment = require("moment");
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
  const amount = Number(data.amount);
  const categoryId = parseInt(data.category);
  const assetId = parseInt(data.to);

  validateCategory(categoryId);
  validateAsset(assetId, userId);

  const image = file ? await uploadFileToS3(file, "Income", userId) : null;
  const income = await prisma.income.create({
    data: {
      amount: amount,
      description: data?.description,
      status: new Date(data?.date) > new Date() ? "Pending" : "Received",
      category: {
        connect: {
          id: categoryId,
        },
      },
      ...(assetId && {
        asset: {
          connect: {
            id: assetId,
          },
        },
      }),
      date: data?.date,
      user: {
        connect: {
          id: userId,
        },
      },
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
        image: image,
        user: {
          connect: {
            id: userId,
          },
        },
        ...(assetId && {
          toAsset: {
            connect: {
              id: assetId,
            },
          },
        }),
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

  const incomes = await prisma.income.findMany({
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
      isActive: true,
      status: true,
      recurringIncome: {
        select: {
          fromAsset: true,
          amount: true,
          type: true,
          // isVariable: true,
          auto: true,
          unit: true,
          interval: true,
          endDate: true,
                    isActive: true,

        },
      },
      transactionHistory: {
        where: {
          isActive: true,
        },
        select: {
          id: true,
          transactionType: true,
          amount: true,
          description: true,
          date: true,
          toAsset: true,
          image: true,
        },
      },
    },
    skip,
    take: size,
  });

  const filteredIncomes = incomes.filter((item) => item !== undefined);
  const incomeWithBalance = filteredIncomes?.map((income) => ({
    ...income,
    type: "Income",
    remainingBalance:
      Number(income.amount) -
      income.transactionHistory.reduce(
        (acc, curr) => acc + Number(curr?.amount || 0),
        0,
      ),
  }));

  const totalPages = Math.ceil(totalCount / size);

  return {
    data: incomeWithBalance,
    totalCount,
    totalPages,
  };
};

const updateIncome = async (userId, data, file, id) => {
  console.log("params:", id);
  console.log("category id", data);

  try {
    const amount = Number(data?.amount);
    const categoryId = parseInt(data.category);
    const assetId = parseInt(data.to);
    const isFuture = new Date(data.date).getTime() > Date.now();

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
        status: isFuture ? "Pending" : "Received",
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
    // const transaction = await prisma.transactionHistory.findFirst({
    //   where: { incomeId: parseInt(id) }, // Ensure expenseId is properly converted to an integer
    // });

    // await prisma.transactionHistory.update({
    //   where: { id: parseInt(transaction?.id) },
    //   data: {
    //     amount: Number(data.amount),
    //     description: data.description,
    //     date: data.date,
    //     updatedAt: new Date(),
    //     toAsset: {
    //       connect: {
    //         id: assetId,
    //       },
    //     },
    //   },
    // });

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

  await prisma.transactionHistory.updateMany({
    where: { incomeId: parseInt(id) },
    data: { isActive: false },
  });

  return;
};

const collectIncome = async (userId, data, id, file) => {
  try {
    const amount = Number(data.amount);
    const assetId = parseInt(data.to);
    console.log(data, "data from patch payment");

    const income = await validateIncome(id);
    const image = file ? await uploadFileToS3(file, "Income", userId) : null;

    // Sum of previous payments for this expense
    const balance = await prisma.transactionHistory.aggregate({
      where: {
        incomeId: income.id,
        isActive: true
      },
      _sum: {
        amount: true,
      },
    });

    const previousPayments = balance._sum.amount || 0;
    const totalReceived = Number(previousPayments) + amount;
    console.log(previousPayments, "previous collections");
    console.log(totalReceived, "total received");

    let newStatus = "Pending";
    if (totalReceived >= income.amount) newStatus = "Received";
    else if (totalReceived > 0) newStatus = "Partial";

    const incomeUpdate = await prisma.income.update({
      where: { id: parseInt(id) },
      data: {
        status: newStatus,
      },
    });

    await prisma.transactionHistory.create({
      data: {
        income: { connect: { id: incomeUpdate.id } },
        user: { connect: { id: userId } },
        toAsset: { connect: { id: assetId } },
        image,
        transactionType: "Income",
        amount,
        description: data.description,
        date: data.date,
      },
    });

    return;
  } catch (err) {
    console.log(err);
    throw new Error(err);
  }
};
const getIncomeGraph = async (userId, query) => {
  const { startDate, endDate, mode } = query;

  const userIdNum = Number(userId);

  const filters = {
    userId: userIdNum,
    date: {
      gte: startDate,
      lte: endDate,
    },
    isActive: true,
    transactionType: "Income",
  };

  try {
    const trendData = await prisma.$queryRawUnsafe(`
      SELECT
        date_trunc('${mode}', "date") AS period,
        SUM(amount) AS total
      FROM "TransactionHistory"
      WHERE
        "date" >= '${moment(startDate)
          .subtract(1, "month")
          .toISOString()}'::timestamp
        AND "date" <= '${endDate}'::timestamp
        AND "isActive" = true
        AND "transactionType" = 'Income'
      GROUP BY period
      ORDER BY period
    `);

    const trend =
      trendData.length >= 2 && trendData[0].total
        ? (
            ((Number(trendData[1].total) - Number(trendData[0].total)) /
              Number(trendData[0].total)) *
            100
          ).toFixed(2)
        : "0.00";

    const incomeGroups = await prisma.transactionHistory.groupBy({
      by: ["incomeId"],
      where: filters,
      _sum: { amount: true },
    });

    const incomeIds = incomeGroups.map((e) => e.incomeId).filter(Boolean);

    const incomes = await prisma.income.findMany({
      where: { id: { in: incomeIds } },
      include: { category: true },
    });

    const incomeMap = new Map(
      incomes.map((e) => [
        e.id,
        {
          categoryId: e.categoryId,
          categoryName: e.category?.name ?? "Unknown",
        },
      ]),
    );

    const categoryTotals = incomeGroups.reduce((acc, item) => {
      const meta = incomeMap.get(item.incomeId);
      if (!meta) return acc;

      if (!acc[meta.categoryId]) {
        acc[meta.categoryId] = {
          categoryId: meta.categoryId,
          categoryName: meta.categoryName,
          total: 0,
        };
      }

      acc[meta.categoryId].total += Number(item._sum.amount ?? 0);
      return acc;
    }, {});

    const data = Object.values(categoryTotals);

    const totalIncome = data.reduce((sum, item) => sum + item.total, 0);

    /* ------------------ RESPONSE ------------------ */
    return {
      trend,
      data,
      total: totalIncome,
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
  collectIncome,
};
