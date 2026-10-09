import moment from "moment-timezone";

import { validateCategory } from "./categories.service.js";

import { AppError } from "../utils/AppError.js";

import { prisma } from "../config/prisma.js";

/*
|--------------------------------------------------------------------------
| Create Recurring Transaction
|--------------------------------------------------------------------------
*/
export const postRecurring = async (userId, data) => {
  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetFromId = Number(data?.account);
  const assetToId = Number(data?.to?.id);
  const type = data?.type;

  if (!["Expense", "Income", "Transfer"].includes(type)) {
    throw new AppError("Invalid transaction type", 400);
  }

  await validateCategory(categoryId);

  const recurringData = {
    user: { connect: { id: userId } },
    type,
    category: { connect: { id: categoryId } },
    amount,
    description: data?.description,
    startDate: data?.date,
    // NOTE: first due date IS the start date. It used to be start + interval, which skipped
    // the first occurrence (no reminder / no auto-log on the start date). The hourly cron
    // (config/cron.js) creates the transaction or reminder once that day arrives, so a
    // start date of today is picked up within the hour and no immediate insert is needed here.
    nextDueDate: new Date(data?.date),
    interval: Number(data?.every),
    unit: data?.frequency,
    behaviour: data?.behaviour,
  };

  if (type === "Expense" || type === "Transfer" || type === "Income") {
    recurringData.fromAsset = { connect: { id: assetFromId } };
  }

  if (type === "Transfer") {
    recurringData.toAsset = { connect: { id: assetToId } };
  }

  if (data?.endDate) {
    recurringData.endDate = data.endDate;
  }

  return prisma.recurringTransaction.create({ data: recurringData });
};

/*
|--------------------------------------------------------------------------
| Get Recurring Transactions
|--------------------------------------------------------------------------
*/
export const getRecurring = async (userId, query) => {
  const { search, pageIndex, pageSize, Categories, startDate, endDate, type } =
    query;

  const page = Number(pageIndex) >= 0 ? Number(pageIndex) + 1 : 1;
  const size = Number(pageSize) > 0 ? Number(pageSize) : 10;
  const skip = (page - 1) * size;

  const filters = {
    userId: Number(userId),
    isActive: true,
    ...(type ? { type } : {}),
    ...(startDate && endDate
      ? {
        nextDueDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }
      : {}),
  };

  if (search) {
    filters.description = {
      startsWith: search,
      mode: "insensitive",
    };
  }

  if (Categories !== undefined) {
    filters.categoryId = {
      in: JSON.parse(Categories),
    };
  }

  const totalCount = await prisma.recurringTransaction.count({
    where: filters,
  });

  const recurring = await prisma.recurringTransaction.findMany({
    where: filters,
    orderBy: { startDate: "desc" },
    skip,
    take: size,
    select: {
      id: true,
      user: true,
      type: true,
      category: true,
      fromAsset: true,
      toAsset: true,
      description: true,
      amount: true,
      startDate: true,
      nextDueDate: true,
      interval: true,
      unit: true,
      isActive: true,
      endDate: true,
      behaviour: true,
      generatedExpenses: true,
      generatedIncomes: true,
      generatedTransfers: true,
    },
  });

  return {
    data: recurring,
    totalCount,
    totalPages: Math.ceil(totalCount / size),
  };
};

/*
|--------------------------------------------------------------------------
| Edit Recurring
|--------------------------------------------------------------------------
*/
export const editRecurring = async (userId, id, data) => {
  const existing = await prisma.recurringTransaction.findFirst({
    where: { id: Number(id), userId: Number(userId) },
  });

  if (!existing) throw new AppError("Recurring transaction not found", 404);

  const amount = Number(data.amount);
  const categoryId = Number(data.category);
  const assetFromId = Number(data?.account);
  const assetToId = Number(data?.to?.id);
  const type = data?.type;

  if (!["Expense", "Income", "Transfer"].includes(type)) {
    throw new AppError("Invalid transaction type", 400);
  }

  await validateCategory(categoryId);

  const updateData = {
    type,
    category: { connect: { id: categoryId } },
    amount,
    description: data?.description,
    interval: Number(data?.every),
    unit: data?.frequency,
    behaviour: data?.behaviour,
    endDate: data?.endDate ? data.endDate : null,
  };

  // NOTE: only reset the schedule when the start date actually changed; otherwise keep
  // nextDueDate so editing e.g. the amount doesn't re-trigger an already processed cycle.
  const newStart = new Date(data?.date);
  if (data?.date && newStart.getTime() !== existing.startDate.getTime()) {
    updateData.startDate = newStart;
    updateData.nextDueDate = newStart;
  }

  updateData.fromAsset =
    type === "Expense" || type === "Transfer"
      ? { connect: { id: assetFromId } }
      : { disconnect: true };

  updateData.toAsset =
    type === "Income" || type === "Transfer"
      ? { connect: { id: assetToId } }
      : { disconnect: true };

  return prisma.recurringTransaction.update({
    where: { id: existing.id },
    data: updateData,
  });
};

/*
|--------------------------------------------------------------------------
| Cancel Recurring
|--------------------------------------------------------------------------
*/
export const cancelRecurring = async (id) => {
  await prisma.recurringTransaction.update({
    where: {
      id: Number(id),
    },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  return { success: true };

};

// `tx` lets callers advance the schedule inside their own $transaction.
export const transactBill = async (id, userId, tx = prisma) => {
  const recurring = await tx.recurringTransaction.findUnique({
    where: { id: Number(id) },
  });

  if (!recurring) throw new AppError("Recurring bill not found", 404);

  const settings = userId
    ? await tx.settings.findFirst({
      where: { userId: Number(userId) },
      select: { timezone: true },
    })
    : null;
  const timezone = settings?.timezone || "UTC";

  // NOTE: same rule as the cron: next = startDate + k * interval (> current due).
  // Previously this always added 1 month, ignoring interval/unit, and passed a moment
  // object to Prisma instead of a Date.
  const currentDue = moment(recurring.nextDueDate).tz(timezone).startOf("day");
  const anchor = moment.tz(recurring.startDate, timezone).startOf("day");
  let k = 1;
  let next = anchor.clone().add(k * recurring.interval, recurring.unit);
  while (!next.isAfter(currentDue)) {
    k++;
    next = anchor.clone().add(k * recurring.interval, recurring.unit);
  }

  const ended =
    recurring.endDate && next.isAfter(moment(recurring.endDate).tz(timezone).endOf("day"));

  await tx.recurringTransaction.update({
    where: { id: recurring.id },
    data: {
      nextDueDate: next.toDate(),
      lastTriggeredAt: new Date(),
      // NOTE: close the schedule when the next cycle would fall after endDate.
      ...(ended && { status: "ENDED", isActive: false }),
    },
  });

  return { success: true };
};
