import { PrismaClient } from "@prisma/client";
import moment from "moment";

import { validateCategory } from "./categories.service.js";
import { validateAsset } from "./assets.service.js";
import { uploadFileToS3, deleteFileFromS3 } from "./s3.service.js";

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

  if (!expense) throw new Error("Expense not found");

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


  const [totalCount, expenses] = await Promise.all([
    prisma.expense.count({ where: filters }),
    prisma.expense.findMany({
      where: filters,
      orderBy: { date: "desc" },
      include: {
        category: true,
        asset: true,
        recurringTemplate: true,
      }, skip,
      take: size,
    }),
  ]);

  const data = expenses.map((expense) => ({
    ...expense,
    type: "Expense",
    remainingBalance:
      Number(expense.amount)
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
export const postExpense = async (userId, data, file) => {
  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetId = Number(data.account);
  const date = new Date(data.date)

  await validateCategory(categoryId);

  if (assetId) {
    const asset = await validateAsset(assetId, userId);

    if (date <= new Date() && asset.balance < amount) {
      throw new Error("Insufficient balance");
    }
  }

  const image = file
    ? await uploadFileToS3(file, "Expense", userId)
    : null;

  const expense = await prisma.expense.create({
    data: {
      amount,
      description: data.description,
      status: date > new Date() ? "Pending" : "Completed",
      date: data.date,
      category: { connect: { id: categoryId } },
      ...(assetId && { asset: { connect: { id: assetId } } }),
      user: { connect: { id: userId } },
      ...(image && { image })
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
  const assetId = Number(data.from);

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
      status: new Date(data.date) > new Date() ? "Pending" : "Paid",
      date: data.date,
      category: { connect: { id: categoryId } },
      ...(assetId && { asset: { connect: { id: assetId } } }),
      user: { connect: { id: userId } },
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

/*
|--------------------------------------------------------------------------
| Post Payment
|--------------------------------------------------------------------------
*/
export const postPayment = async (userId, data, id, file) => {
  const expense = await validateExpense(id);

  const amount = Number(data.amount);
  const assetId = Number(data.from);

  const image = file
    ? await uploadFileToS3(file, "Expense", userId)
    : null;

  // const aggregate = await prisma.transactionHistory.aggregate({
  //   where: {
  //     expenseId: expense.id,
  //     isActive: true,
  //   },
  //   _sum: { amount: true },
  // });

  // const totalPaid = Number(aggregate._sum.amount || 0) + amount;

  let status = "Pending";
  if (totalPaid >= expense.amount) status = "Paid";
  else if (totalPaid > 0) status = "Partial";

  await prisma.expense.update({
    where: { id: Number(id) },
    data: { status },
  });

  await prisma.transactionHistory.create({
    data: {
      expense: { connect: { id: expense.id } },
      user: { connect: { id: userId } },
      fromAsset: { connect: { id: assetId } },
      transactionType: "Expense",
      amount,
      description: data.description,
      date: data.date,
      image,
    },
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
  };

  try {
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
          ((Number(trendData[1].total) -
            Number(trendData[0].total)) /
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
      },
    });

    const categoryMap = new Map(
      categories.map((category) => [
        category.id,
        category.name,
      ])
    );

    const data = expenseGroups.map((item) => ({
      categoryId: item.categoryId,
      categoryName:
        categoryMap.get(item.categoryId) || "Unknown",
      total: Number(item._sum.amount || 0),
    }));

    const totalExpense = data.reduce(
      (sum, item) => sum + item.total,
      0
    );

    /* ---------------- RESPONSE ---------------- */
    return {
      trend,
      data,
      total: totalExpense,
    };
  } catch (error) {
    console.error("getExpenseGraph error:", error);
    throw new Error("Internal server error");
  }
};