import { PrismaClient } from "@prisma/client";
import moment from "moment";

import { AppError } from "../utils/AppError.js";
import { getAssetBalance } from "./assets.service.js";
import { validateCategory } from "./categories.service.js";
import { deleteFileFromS3, uploadFileToS3 } from "./s3.service.js";

const prisma = new PrismaClient();

/*
|--------------------------------------------------------------------------
| Validate Expense
|--------------------------------------------------------------------------
*/
export const validateExpense = async (id) => {
  const expense = await prisma.expense.findFirst({
    where: { id: Number(id) },
  });

  if (!expense) throw new AppError("Expense not found", 404);

  return expense;
};

/*
|--------------------------------------------------------------------------
| Get Expenses (Paginated + Filters)
|--------------------------------------------------------------------------
*/
export const getExpenses = async (userId, query) => {
  const {
    search,
    pageIndex,
    pageSize,
    Categories,
    Assets,
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
    ...(Assets && {
      assetId: {
        in: JSON.parse(Assets)
      }
    })
  };

  const [totalCount, expenses] = await Promise.all([
    prisma.expense.count({ where: filters }),
    prisma.expense.findMany({
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

  const data = expenses.map((expense) => ({
    ...expense,
    type: "Expense",
    remainingBalance: Number(expense.amount),
  }));

  return {
    data,
    totalCount,
    totalPages: Math.ceil(totalCount / size),
  };
};

/*
|--------------------------------------------------------------------------
| Create Expense
|--------------------------------------------------------------------------
*/
export const postExpense = async (userId, data, file, id) => {
  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetId = Number(data.account);
  const date = new Date(data.date);
  const recurringId = Number(id);

  await validateCategory(categoryId);

  if (assetId) {
    const asset = await getAssetBalance(userId, assetId);
    if (date <= new Date() && asset.balance < amount) {
      throw new AppError("Insufficient balance", 400);
    }
  }

  const image = file ? await uploadFileToS3(file, "Expense", userId) : null;

  const expense = await prisma.expense.create({
    data: {
      amount,
      description: data.description,
      status: "Completed",
      date: data.date,
      category: { connect: { id: categoryId } },
      ...(assetId && { asset: { connect: { id: assetId } } }),
      user: { connect: { id: userId } },
      ...(image && { image }),
      ...(recurringId && { recurringTemplate: { connect: { id: recurringId } } })
    },
  });

  return expense;
};

/*
|--------------------------------------------------------------------------
| Update Expense
|--------------------------------------------------------------------------
*/
export const updateExpense = async (userId, data, file, id) => {
  const expense = await validateExpense(id);

  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetId = Number(data.account);

  let image = expense.image;

  if (file) {
    image = await uploadFileToS3(file, "Expense", userId);

    if (expense.image) {
      await deleteFileFromS3(expense.image);
    }
  } else if (!data.image && expense.image) {
    await deleteFileFromS3(expense.image);
    image = null;
  }

  const updated = await prisma.expense.update({
    where: { id: Number(id) },
    data: {
      amount,
      description: data.description,
      date: data.date,
      categoryId: categoryId,
      assetId: assetId,
      updatedAt: new Date(),
    },
  });

  return updated;
};

/*
|--------------------------------------------------------------------------
| Delete Expense (Soft Delete)
|--------------------------------------------------------------------------
*/
export const deleteExpense = async (id) => {
  await validateExpense(id);

  await prisma.expense.update({
    where: { id: Number(id) },
    data: { isActive: false },
  });

  return true;
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
    status: "Completed"
  };


  /* ------------------ TREND DATA ------------------ */
  const trendData = await prisma.$queryRawUnsafe(`
      SELECT
        date_trunc('${mode}', "date") AS period,
        SUM(amount) AS total
      FROM "Expense"
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
  const expenseGroups = await prisma.expense.groupBy({
    by: ["categoryId"],
    where: filters,
    _sum: {
      amount: true,
    },
  });

  const categoryIds = expenseGroups
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

  const data = expenseGroups.map((item) => {
    const category = categoryMap.get(item.categoryId);

    return {
      categoryId: item.categoryId,
      categoryName: category?.name || "Unknown",
      color: category?.color || "#ccc",
      total: Number(item._sum.amount || 0),
    };
  });

  const totalExpense = data.reduce((sum, item) => sum + item.total, 0).toFixed(2);

  /* ---------------- RESPONSE ---------------- */
  return {
    trend,
    data,
    total: totalExpense,
  };
};


export const getScheduledExpenses = async (userId, data) => {

  const dateFilter =
    data.dateFrom || data.dateTo
      ? {
        nextDueDate: {
          ...(data.dateFrom && { gte: data.dateFrom }),
          ...(data.dateTo && { lte: data.dateTo }),
        },
      }
      : {};

  const baseSelect = {
    id: true,
    description: true,
    amount: true,
    nextDueDate: true,
    behaviour: true,
    category: {
      select: {
        name: true,
        icon: true,
        color: true,
      },
    },
  };

  const [remindBills, autoLogBills] = await Promise.all([
    // Existing behaviour: bills that always need manual confirmation
    prisma.recurringTransaction.findMany({
      where: {
        userId,
        type: "Expense",
        status: "ACTIVE",
        behaviour: "REMIND",
        isActive: true,
        ...dateFilter,
      },
      select: baseSelect,
      orderBy: { nextDueDate: "asc" },
    }),

    // AUTO_LOG bills whose cron failed on the current cycle
    prisma.recurringTransaction.findMany({
      where: {
        userId,
        type: "Expense",
        status: "ACTIVE",
        behaviour: "AUTO_LOG",
        isActive: true,
        ...dateFilter,
        logs: {
          some: {
            result: "FAILED",
            firedAt: { equals: data.dateFrom ? undefined : undefined }, // placeholder, see note below
          },
        },
      },
      select: {
        ...baseSelect,
        logs: {
          where: { result: "FAILED" },
          orderBy: { firedAt: "desc" },
          take: 1,
          select: { errorMessage: true, firedAt: true },
        },
      },
      orderBy: { nextDueDate: "asc" },
    }),
  ]);

  const normalizedRemind = remindBills.map((b) => ({
    ...b,
    needsAttention: false,
    failureReason: null,
  }));

  const normalizedFailed = autoLogBills.map((b) => ({
    ...b,
    needsAttention: true,
    failureReason: b.logs[0]?.errorMessage ?? "Auto-pay failed",
    logs: undefined,
  }));

  const priorityRank = (bill) => {
    if (bill.needsAttention) return 0; // failed auto-pay
    const isOverdue = new Date(bill.nextDueDate) < new Date();
    if (isOverdue) return 1;
    return 2; // due today / upcoming
  };

  return [...normalizedRemind, ...normalizedFailed].sort((a, b) => {
    const rankDiff = priorityRank(a) - priorityRank(b);
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.nextDueDate) - new Date(b.nextDueDate);
  });
};

export const getScheduledExpense = async (userId, id) => {
  const recurringExpenses = await prisma.recurringTransaction.findFirst({
    where: {
      id: Number(id),
      userId,
      type: "Expense",
      status: "ACTIVE",
      isActive: true,
    },
    select: {
      id: true,
      description: true,
      amount: true,
      nextDueDate: true,
      startDate: true,
      interval: true,
      unit: true,
      behaviour: true,
      fromAsset: true,
      category: {
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
        },
      },
    },
    orderBy: {
      nextDueDate: "asc",
    },
  });

  const asset = await getAssetBalance(userId, recurringExpenses.fromAsset?.id);

  return {
    ...recurringExpenses,
    fromAsset: {
      ...recurringExpenses.fromAsset,
      remainingBalance: asset?.remainingBalance,
    },
  };


};

export const getBillPayments = async (id) => {

  const history = await prisma.expense.findMany({
    where: {
      recurringId: Number(id),
      status: {
        in: ["Completed", "Skipped"],
      },
    },
    orderBy: {
      recurringDueDate: "desc", // or date: "desc"
    },
  });

  return history;

};


export const skipBillPayment = async (id) => {
  const recurring = await prisma.recurringTransaction.findUnique({
    where: {
      id: Number(id),
    },
  });

  if (!recurring) {
    throw new AppError("Recurring transaction not found.", 400);
  }

  const entry = await prisma.expense.create({
    data: {
      userId: recurring.userId,
      categoryId: recurring.categoryId,

      recurringId: recurring.id,

      date: moment(),
      recurringDueDate: recurring.nextDueDate,

      description: recurring.description,
      amount: recurring.amount,
      status: "Skipped",
    },
  });

  return entry;

};