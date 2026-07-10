import { PrismaClient } from "@prisma/client";
import moment from "moment";
import { AppError } from "../utils/AppError.js";
import { getAssetBalance } from "./assets.service.js";
import { validateCategory } from "./categories.service.js";
import { uploadFileToS3 } from "./s3.service.js";

const prisma = new PrismaClient();

/* ---------------- VALIDATION ---------------- */

export const validateTransfers = async (id) => {
  const transfer = await prisma.transfer.findFirst({
    where: { id: parseInt(id) },
  });

  if (!transfer) {
    throw new AppError("Transfer not found", 404);
  }

  return transfer;
};

/* ---------------- GET TRANSFERS ---------------- */

export const getTransfers = async (userId, query) => {
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
    ...(status && {
      status: {
        startsWith: status,
      },
    }),
    ...(Categories !== undefined && {
      categoryId: {
        in: JSON.parse(Categories),
      },
    }),
  };

  const [totalCount, transfers] = await Promise.all([
    prisma.transfer.count({ where: filters }),
    prisma.transfer.findMany({
      where: filters,
      orderBy: { date: "desc" },
      include: {
        category: true,
        toAsset: true,
        fromAsset: true,
        recurringTemplate: true,
      },
      skip,
      take: size,
    }),
  ]);

  const data = transfers.map((transfer) => ({
    ...transfer,
    type: "Transfer",
    remainingBalance: Number(transfer.amount),
  }));
  return {
    data: transfers,
    totalCount,
    totalPages: Math.ceil(totalCount / size),
  };
};

/* ---------------- CREATE TRANSFER ---------------- */

export const postTransfer = async (userId, data, file) => {
  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const fromAssetId = Number(data.account);
  const toAssetId = Number(data.to);

  const category = await validateCategory(categoryId);

  if (fromAssetId) {
    const asset = await getAssetBalance(userId, fromAssetId);

    if (asset.balance < amount) {
      throw new AppError("Insufficient balance", 400);
    }
  }

  const image = file ? await uploadFileToS3(file, "Transfer", userId) : null;

  const transfer = await prisma.transfer.create({
    data: {
      amount,
      description: data.description,
      status: new Date(data.date) > new Date() ? "Pending" : "Completed",

      category: {
        connect: { id: categoryId },
      },

      ...(fromAssetId && {
        fromAsset: { connect: { id: fromAssetId } },
      }),

      ...(toAssetId && {
        toAsset: { connect: { id: toAssetId } },
      }),

      date: data.date,
      user: { connect: { id: userId } },
    },
  });

  return transfer;
};

/* ---------------- DELETE TRANSFER ---------------- */

export const deleteTransfer = async (userId, id) => {
  await validateTransfers(id);

  await prisma.transfer.update({
    where: { id: parseInt(id) },
    data: { isActive: false },
  });

  await prisma.transactionHistory.updateMany({
    where: { transferId: parseInt(id) },
    data: { isActive: false },
  });
};

/* ---------------- PAYMENT ---------------- */

export const postPayment = async (userId, data, id, file) => {
  const amount = Number(data.amount);
  const assetId = parseInt(data.from);

  const transfer = await validateTransfers(id);

  const image = file ? await uploadFileToS3(file, "Transfer", userId) : null;

  await prisma.transactionHistory.create({
    data: {
      transfer: { connect: { id: transfer.id } },
      user: { connect: { id: userId } },
      fromAsset: { connect: { id: assetId } },
      transactionType: "Transfer",
      amount,
      description: data.description,
      date: data.date,
      image,
    },
  });
};

/* ---------------- GRAPH ---------------- */

export const getTransferGraph = async (userId, query) => {
  const { startDate, endDate, mode } = query;

  const filters = {
    userId: Number(userId),
    isActive: true,
    transactionType: "Transfer",
    date: {
      gte: startDate,
      lte: endDate,
    },
  };

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
      AND "transactionType" = 'Transfer'
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

  const transferGroups = await prisma.transactionHistory.groupBy({
    by: ["transferId"],
    where: filters,
    _sum: { amount: true },
  });

  const transferIds = transferGroups.map((e) => e.transferId).filter(Boolean);

  const transfers = await prisma.transfer.findMany({
    where: { id: { in: transferIds } },
    include: { category: true },
  });

  const transferMap = new Map(
    transfers.map((t) => [
      t.id,
      {
        categoryId: t.categoryId,
        categoryName: t.category?.name ?? "Unknown",
      },
    ]),
  );

  const categoryTotals = transferGroups.reduce((acc, item) => {
    const meta = transferMap.get(item.transferId);
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

  return {
    trend,
    data,
    total: data.reduce((sum, i) => sum + i.total, 0),
  };
};
