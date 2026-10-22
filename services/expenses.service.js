import { AppError } from "../utils/AppError.js";
import {
  ACCOUNT_RULES,
  assertAccountCategory,
  assertCanSpend,
} from "./assets.service.js";
import { validateCategory } from "./categories.service.js";
import { deleteFileFromS3, uploadFileToS3 } from "./s3.service.js";

import { prisma } from "../config/prisma.js";
import { getPeriodRange, getUserTimezone } from "../utils/userTimezone.js";
import { units } from "../schema/transaction.js";
import { buildGraphFilters } from "../utils/graphFilters.js";
import { buildInstallmentSchedule, hasDueRule } from "../utils/creditCycle.js";

/*
|--------------------------------------------------------------------------
| Validate Expense
|--------------------------------------------------------------------------
*/
export const validateExpense = async (id, userId) => {
  const expense = await prisma.expense.findFirst({
    where: { id: Number(id), userId },
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
    isActive,
  } = query;

  const page = Number(pageIndex) >= 0 ? Number(pageIndex) + 1 : 1;
  const size = Number(pageSize) > 0 ? Number(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: Number(userId),
    // Defaults to active; the "Inactive" tab sends isActive=false
    isActive: String(isActive) !== "false",
    ...(startDate &&
      endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    ...(search && {
      description: {
        contains: search,
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
        in: JSON.parse(Assets),
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

  const asset = await assertAccountCategory(
    userId,
    assetId,
    ACCOUNT_RULES.expense,
  );

  if (assetId && date <= new Date()) {
    await assertCanSpend(userId, assetId, amount);
  }

  // Multipart bodies arrive as strings, so "false" must not read as truthy.
  const isInstallment = data.installment === true || data.installment === "true";
  const plan = isInstallment
    ? await buildInstallmentPlan(userId, asset, data, date)
    : null;

  const image = file ? await uploadFileToS3(file, "Expense", userId) : null;

  // The expense and its plan are saved together so a failure can't leave a
  // card purchase without its installments.
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        amount,
        description: data.description,
        status: "Completed",
        date: data.date,
        category: { connect: { id: categoryId } },
        ...(assetId && { asset: { connect: { id: assetId } } }),
        user: { connect: { id: userId } },
        ...(image && { image }),
        ...(recurringId && {
          recurringTemplate: { connect: { id: recurringId } },
        }),
      },
    });

    if (plan) {
      await tx.creditInstallmentPlan.create({
        data: {
          creditDetailId: plan.creditDetailId,
          expenseId: expense.id,
          description: data.description,
          totalAmount: amount,
          monthlyAmount: plan.monthlyAmount,
          termMonths: plan.termMonths,
          startDate: plan.startDate,
          installments: { create: plan.installments },
        },
      });
    }

    return expense;
  });
};

// Validates the installment inputs and lays the plan out on the card's cycles.
const buildInstallmentPlan = async (userId, asset, data, date) => {
  const termMonths = Number(data.termMonths);
  const monthlyAmount = Number(data.monthlyAmount);
  const skip = Number(data.installmentSkip ?? 0);

  if (asset.category !== "CREDIT") {
    throw new AppError("Installments are only available on credit cards", 400);
  }
  if (!Number.isInteger(termMonths) || termMonths < 2 || termMonths > 60) {
    throw new AppError("Term must be 2 to 60 months", 400);
  }
  if (!(monthlyAmount > 0)) {
    throw new AppError("Monthly amount must be greater than 0", 400);
  }
  if (!Number.isInteger(skip) || skip < 0 || skip > 12) {
    throw new AppError("Deferred start must be 0 to 12 months", 400);
  }

  const creditDetail = await prisma.creditDetail.findUnique({
    where: { assetId: asset.id },
  });
  if (!hasDueRule(creditDetail)) {
    throw new AppError(
      "Set the card's statement date and due date before using installments",
      400,
    );
  }

  const { startDate, installments } = buildInstallmentSchedule({
    purchaseDate: date,
    timezone: await getUserTimezone(userId),
    creditDetail,
    termMonths,
    monthlyAmount,
    skip,
  });

  return {
    creditDetailId: creditDetail.id,
    monthlyAmount,
    termMonths,
    startDate,
    installments,
  };
};

/*
|--------------------------------------------------------------------------
| Update Expense
|--------------------------------------------------------------------------
*/
export const updateExpense = async (userId, data, file, id) => {
  const expense = await validateExpense(id, userId);

  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetId = Number(data.account);

  if (assetId)
    await assertAccountCategory(userId, assetId, ACCOUNT_RULES.expense);

  // The expense's current amount is already counted against its account when
  // it is Completed on the same one, so add it back before checking.
  if (assetId && new Date(data.date) <= new Date()) {
    await assertCanSpend(userId, assetId, amount, {
      restore:
        expense.status === "Completed" && expense.assetId === assetId
          ? Number(expense.amount)
          : 0,
    });
  }

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
      image,
      updatedAt: new Date(),
    },
  });

  return updated;
};

export const getGraph = async (userId, query) => {
  const { startDate, endDate, mode } = query;

  if (!units.includes(mode)) throw new AppError("Invalid mode", 400);

  const userIdNum = Number(userId);

  const timezone = await getUserTimezone(userIdNum);
  const { start, end, prevStart } = getPeriodRange(
    startDate,
    endDate,
    mode,
    timezone,
  );

  const { where: tableFilters, sql: trendFilters } = buildGraphFilters(
    query,
    "Completed",
  );

  const filters = {
    userId: userIdNum,
    ...tableFilters,
    date: {
      gte: start,
      lte: end,
    },
  };

  /* ------------------ TREND DATA ------------------ */
  // "date" is stored as UTC (timestamp without time zone). Convert it to the user's
  // local time before truncating so day/week/month buckets follow their timezone.
  const rangeStart = prevStart.toISOString();
  const rangeEnd = end.toISOString();

  const trendData = await prisma.$queryRaw`
    SELECT
      date_trunc(${mode}::text, ("date" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}::text) AS period,
      SUM(amount) AS total
    FROM "Expense"
    WHERE
      "date" >= ${rangeStart}::timestamp
      AND "date" <= ${rangeEnd}::timestamp
      AND "userId" = ${userIdNum}
      ${trendFilters}
    GROUP BY period
    ORDER BY period
  `;

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

  const totalExpense = data
    .reduce((sum, item) => sum + item.total, 0)
    .toFixed(2);

  /* ---------------- RESPONSE ---------------- */
  return {
    trend,
    data,
    total: totalExpense,
  };
};
