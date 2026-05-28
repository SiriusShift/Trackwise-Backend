import { PrismaClient } from "@prisma/client";
import moment from "moment";

import { validateCategory } from "./categories.service.js";
import { validateAsset } from "./assets.service.js";
import { uploadFileToS3, deleteFileFromS3 } from "./s3.service.js";

const prisma = new PrismaClient();

/* =========================
   VALIDATION
========================= */

export const validateIncome = async (id) => {
  const income = await prisma.income.findFirst({
    where: { id: Number(id) },
  });

  if (!income) {
    throw new Error("Income not found");
  }

  return income;
};

/* =========================
   CREATE INCOME
========================= */

export const postIncome = async (userId, data, file) => {
  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetId = Number(data.account);
  const date = new Date(data.date);

  console.log(data, "data!");
  await validateCategory(categoryId);
  await validateAsset(assetId, userId);

  const image = file ? await uploadFileToS3(file, "Income", userId) : null;

  const income = await prisma.income.create({
    data: {
      amount,
      description: data.description,
      status: date > new Date() ? "Pending" : "Completed",
      date: data.date,
      category: { connect: { id: categoryId } },
      ...(assetId && { asset: { connect: { id: assetId } } }),
      user: { connect: { id: userId } },
      ...(image && { image }),
    },
  });

  return income;
};

/* =========================
   GET INCOME
========================= */

export const getIncome = async (userId, query) => {
  const {
    search,
    pageIndex,
    pageSize,
    Categories,
    startDate,
    endDate,
    status,
  } = query;

  const page = Number(pageIndex) >= 0 ? Number(pageIndex) + 1 : 1;
  const size = Number(pageSize) > 0 ? Number(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: Number(userId),
    isActive: true,
    ...(startDate &&
      endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    ...(search && {
      description: {
        startsWith: search,
        mode: "insensitive",
      },
    }),
    ...(status && { status }),
    ...(Categories && {
      categoryId: {
        in: JSON.parse(Categories),
      },
    }),
  };

  const [totalCount, incomes] = await Promise.all([
    prisma.income.count({ where: filters }),
    prisma.income.findMany({
      where: filters,
      orderBy: { date: "desc" },
      include: {
        category: true,
        asset: true,
        recurringTemplate: true,
      },
      skip,
      take: size,
    }),
  ]);

  const data = incomes.map((income) => ({
    ...income,
    type: "Income",
    remainingBalance: Number(income.amount),
  }));

  return {
    data,
    totalCount,
    totalPages: Math.ceil(totalCount / size),
  };
};

/* =========================
   UPDATE INCOME
========================= */

export const updateIncome = async (userId, data, file, id) => {
  const income = await validateIncome(id);

  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetId = Number(data.to);
  const isFuture = new Date(data.date) > new Date();

  let image = income.image;

  if (file) {
    image = await uploadFileToS3(file, "Income", userId);

    if (income.image) {
      await deleteFileFromS3(income.image);
    }
  }

  return await prisma.income.update({
    where: { id: Number(id) },
    data: {
      amount,
      description: data.description,
      status: isFuture ? "Pending" : "Received",

      category: { connect: { id: categoryId } },
      asset: { connect: { id: assetId } },

      date: data.date,
      updatedAt: new Date(),

      user: { connect: { id: userId } },
    },
  });
};

/* =========================
   DELETE INCOME
========================= */

export const deleteIncome = async (id) => {
  await validateIncome(id);

  await prisma.income.update({
    where: { id: Number(id) },
    data: { isActive: false },
  });

  await prisma.transactionHistory.updateMany({
    where: { incomeId: Number(id) },
    data: { isActive: false },
  });
};

/* =========================
   COLLECT INCOME
========================= */

export const collectIncome = async (userId, data, id, file) => {
  const income = await validateIncome(id);

  const amount = Number(data.amount);
  const assetId = Number(data.to);

  const image = file ? await uploadFileToS3(file, "Income", userId) : null;

  const aggregate = await prisma.transactionHistory.aggregate({
    where: {
      incomeId: income.id,
      isActive: true,
    },
    _sum: { amount: true },
  });

  const totalReceived = Number(aggregate._sum.amount || 0) + amount;

  const status =
    totalReceived >= income.amount
      ? "Received"
      : totalReceived > 0
        ? "Partial"
        : "Pending";

  await prisma.income.update({
    where: { id: income.id },
    data: { status },
  });

  await prisma.transactionHistory.create({
    data: {
      income: { connect: { id: income.id } },
      user: { connect: { id: userId } },
      toAsset: { connect: { id: assetId } },

      transactionType: "Income",
      amount,
      description: data.description,
      date: data.date,
      image,
    },
  });
};

export const getGraph = async (userId, query) => {
  const { startDate, endDate, mode } = query;

  const userIdNum = Number(userId);

  const filters = {
    userId: userIdNum,
    isActive: true,
    date: {
      gte: new Date(startDate),
      lte: new Date(endDate),
    },
  };

  try {
    /* ------------------ TREND DATA ------------------ */
    const trendData = await prisma.$queryRawUnsafe(`
      SELECT
        date_trunc('${mode}', "date") AS period,
        SUM(amount) AS total
      FROM "Income"
      WHERE
        "date" >= '${moment(startDate)
          .subtract(1, "month")
          .toISOString()}'::timestamp
        AND "date" <= '${endDate}'::timestamp
        AND "isActive" = true
        AND "userId" = ${userIdNum}
      GROUP BY period
      ORDER BY period
    `);

    const trend =
      trendData.length >= 2 && trendData[0]?.total
        ? (
            ((Number(trendData[1].total) - Number(trendData[0].total)) /
              Number(trendData[0].total)) *
            100
          ).toFixed(2)
        : "0.00";

    /* ---------------- CATEGORY TOTALS ---------------- */
    const incomeGroups = await prisma.income.groupBy({
      by: ["categoryId"],
      where: filters,
      _sum: {
        amount: true,
      },
    });

    const categoryIds = incomeGroups
      .map((item) => item.categoryId)
      .filter(Boolean);

    const categories = await prisma.categories.findMany({
      where: {
        id: {
          in: categoryIds,
        },
      },
      select: {
        id: true,
        name: true,
        color: true,
      },
    });

    const categoryMap = new Map(
      categories.map((category) => [
        category.id,
        {
          name: category.name,
          color: category.color,
        },
      ]),
    );

    const data = incomeGroups.map((item) => {
            const category = categoryMap.get(item.categoryId);

      return {
        categoryId: item.categoryId,
        categoryName: category?.name || "Unknown",
        color: category?.color || "#ccc",

        total: Number(item._sum.amount || 0),
      };
    });

    const totalIncome = data.reduce((sum, item) => sum + item.total, 0).toFixed(2);

    /* ---------------- RESPONSE ---------------- */
    return {
      trend,
      data,
      total: totalIncome,
    };
  } catch (error) {
    console.error("getIncomeGraph error:", error);
    throw new Error("Internal server error");
  }
};
