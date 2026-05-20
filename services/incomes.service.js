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
  const assetId = Number(data.to);

  await validateCategory(categoryId);
  await validateAsset(assetId, userId);

  const image = file
    ? await uploadFileToS3(file, "Income", userId)
    : null;

  const isFuture = new Date(data.date) > new Date();

  const income = await prisma.income.create({
    data: {
      amount,
      description: data.description,
      status: isFuture ? "Pending" : "Received",

      category: {
        connect: { id: categoryId },
      },

      ...(assetId && {
        asset: { connect: { id: assetId } },
      }),

      date: data.date,

      user: {
        connect: { id: userId },
      },
    },
  });

  if (!isFuture) {
    await prisma.transactionHistory.create({
      data: {
        income: { connect: { id: income.id } },
        user: { connect: { id: userId } },

        ...(assetId && {
          toAsset: { connect: { id: assetId } },
        }),

        transactionType: "Income",
        amount,
        description: data.description,
        date: data.date,
        image,
      },
    });
  }

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

  const [totalCount, incomes] = await Promise.all([
    prisma.income.count({ where: filters }),
    prisma.income.findMany({
      where: filters,
      orderBy: { date: "desc" },
      skip,
      take: size,
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        status: true,
        isActive: true,

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

        transactionHistory: {
          where: { isActive: true },
          select: {
            amount: true,
          },
        },

        recurringTemplate: {
          select: {
            toAsset: true,
            amount: true,
            type: true,
            auto: true,
            unit: true,
            interval: true,
            endDate: true,
            isActive: true,
          },
        },
      },
    }),
  ]);

  const data = incomes.map((income) => ({
    ...income,
    type: "Income",
    remainingBalance:
      Number(income.amount) -
      income.transactionHistory.reduce(
        (acc, curr) => acc + Number(curr.amount || 0),
        0
      ),
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

  const image = file
    ? await uploadFileToS3(file, "Income", userId)
    : null;

  const aggregate = await prisma.transactionHistory.aggregate({
    where: {
      incomeId: income.id,
      isActive: true,
    },
    _sum: { amount: true },
  });

  const totalReceived =
    Number(aggregate._sum.amount || 0) + amount;

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