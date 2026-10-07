import moment from "moment";
import { AppError } from "../utils/AppError.js";
import { getAssetBalance } from "./assets.service.js";
import { validateCategory } from "./categories.service.js";
import { deleteFileFromS3, uploadFileToS3 } from "./s3.service.js";

import { prisma } from "../config/prisma.js";

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
    Assets
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
    ...(Assets && {
      assetId: {
        in: JSON.parse(Assets)
      }
    })
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

/* ---------------- UPDATE TRANSFER ---------------- */

export const updateTransfer = async (userId, data, file, id) => {
  const transfer = await validateTransfers(id);

  if (transfer.userId !== Number(userId)) {
    throw new AppError("Transfer not found", 404);
  }

  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const fromAssetId = Number(data.account);
  const toAssetId = Number(data.to);

  if (fromAssetId && toAssetId && fromAssetId === toAssetId) {
    throw new AppError("Destination account must be different from source account", 400);
  }

  await validateCategory(categoryId);

  // Balance check. If this transfer already counts against the same source account
  // (Completed), its current amount is already deducted, so add it back before comparing.
  if (fromAssetId) {
    const result = await getAssetBalance(userId, fromAssetId);
    const asset = result?.data?.[0] ?? result;
    const available =
      Number(asset?.remainingBalance ?? asset?.balance ?? 0) +
      (transfer.status === "Completed" && transfer.fromAssetId === fromAssetId
        ? Number(transfer.amount)
        : 0);

    if (available < amount) {
      throw new AppError("Insufficient balance", 400);
    }
  }

  let image = transfer.image;

  if (file) {
    image = await uploadFileToS3(file, "Transfer", userId);

    if (transfer.image) {
      await deleteFileFromS3(transfer.image);
    }
  }

  return prisma.transfer.update({
    where: { id: transfer.id },
    data: {
      amount,
      description: data.description,
      status: new Date(data.date) > new Date() ? "Pending" : "Completed",
      image,

      category: { connect: { id: categoryId } },
      ...(fromAssetId && { fromAsset: { connect: { id: fromAssetId } } }),
      ...(toAssetId ? { toAsset: { connect: { id: toAssetId } } } : { toAsset: { disconnect: true } }),

      date: data.date,
    },
  });
};

/* ---------------- DELETE TRANSFER ---------------- */

export const deleteTransfer = async (userId, id) => {
  await validateTransfers(id);

  await prisma.transfer.update({
    where: { id: parseInt(id) },
    data: { isActive: false },
  });

};

/* ---------------- GRAPH ---------------- */

export const getTransferGraph = async (userId, query) => {
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

  /* ------------------ TREND DATA ------------------ */
  const trendData = await prisma.$queryRawUnsafe(`
    SELECT
      date_trunc('${mode}', "date") AS period,
      SUM(amount) AS total
    FROM "Transfer"
    WHERE
      "date" >= '${moment(startDate).subtract(1, "month").toISOString()}'::timestamp
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
  const transferGroups = await prisma.transfer.groupBy({
    by: ["categoryId"],
    where: filters,
    _sum: { amount: true },
  });

  const categories = await prisma.categories.findMany({
    where: { id: { in: transferGroups.map((g) => g.categoryId).filter(Boolean) } },
    select: { id: true, name: true },
  });

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const data = transferGroups.map((g) => ({
    categoryId: g.categoryId,
    categoryName: categoryMap.get(g.categoryId) ?? "Unknown",
    total: Number(g._sum.amount ?? 0),
  }));

  return {
    trend,
    data,
    total: data.reduce((sum, i) => sum + i.total, 0),
  };
};
