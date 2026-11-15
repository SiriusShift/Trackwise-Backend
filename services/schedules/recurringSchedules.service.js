import moment from "moment-timezone";

import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { assertCanSpend } from "../assets.service.js";
import { validateCategory } from "../categories.service.js";
import { transactBill } from "../recurring.service.js";
import {
  assetSelect,
  categorySelect,
  getAssetRemainingBalance,
  getTimezone,
  inRange,
} from "./shared.js";

/*
|--------------------------------------------------------------------------
| Source: RECURRING
|--------------------------------------------------------------------------
| RecurringTransaction (Expense | Income | Transfer). The cycle on
| nextDueDate is the actionable one; later cycles inside the requested range
| are projections.
*/
// Safety cap so a daily schedule over a huge range can't explode the response.
const MAX_OCCURRENCES_PER_ITEM = 400;

// Recurring items store their account differently per type (Income used
// toAsset before, fromAsset now), so resolve it in one place.
const getRecurringAccount = (item) =>
  item.type === "Income" ? (item.fromAsset ?? item.toAsset) : item.fromAsset;

// fromAsset / toAsset as the schedule shows them: Income only moves money in.
const recurringAssets = (item) =>
  item.type === "Income"
    ? { fromAsset: null, toAsset: getRecurringAccount(item) }
    : { fromAsset: item.fromAsset, toAsset: item.toAsset };

// Start of the day the current cycle is due; recurring logs are keyed on it.
const currentCycleDate = (recurring, timezone) =>
  moment(recurring.nextDueDate).tz(timezone).startOf("day").toDate();

// Same anchoring rule as the cron: occurrence k = startDate + k * interval.
const occurrence = (item, k, timezone) =>
  moment
    .tz(item.startDate, timezone)
    .startOf("day")
    .add(k * item.interval, item.unit);

export const getRecurringItems = async (
  userId,
  timezone,
  { from, to, type },
) => {
  const recurringList = await prisma.recurringTransaction.findMany({
    where: {
      userId: Number(userId),
      status: "ACTIVE",
      isActive: true,
      ...(type && { type }),
      ...(to && { nextDueDate: { lte: new Date(to) } }),
    },
    include: {
      category: { select: categorySelect },
      fromAsset: { select: assetSelect },
      toAsset: { select: assetSelect },
      logs: {
        where: { result: "FAILED" },
        orderBy: { firedAt: "desc" },
        take: 1,
        select: { errorMessage: true, firedAt: true },
      },
    },
  });

  const items = [];

  for (const item of recurringList) {
    const nextDue = moment(item.nextDueDate).tz(timezone).startOf("day");
    const endDate = item.endDate
      ? moment(item.endDate).tz(timezone).endOf("day")
      : null;

    // A FAILED log only matters for the cycle that is currently due.
    const failedLog = item.logs[0];
    const needsAttention =
      item.behaviour === "AUTO_LOG" &&
      !!failedLog &&
      moment(failedLog.firedAt).tz(timezone).isSame(nextDue, "day");

    const base = {
      source: "RECURRING",
      sourceId: item.id,
      type: item.type,
      description: item.description,
      amount: Number(item.amount),
      behaviour: item.behaviour,
      interval: item.interval,
      unit: item.unit,
      category: item.category,
      ...recurringAssets(item),
      status: null,
    };

    // The current cycle is always returned when it's in range (or overdue
    // and no lower bound was given), even if it's before `from`.
    const pushCycle = (dueDate, isCurrent) => {
      items.push({
        ...base,
        key: `recurring-${item.id}-${dueDate.format("YYYYMMDD")}`,
        dueDate: dueDate.toDate(),
        projected: !isCurrent,
        actionable:
          isCurrent && (item.behaviour === "REMIND" || needsAttention),
        needsAttention: isCurrent && needsAttention,
        failureReason:
          isCurrent && needsAttention
            ? (failedLog.errorMessage ?? "Auto-log failed")
            : null,
      });
    };

    if (inRange(nextDue, from, to)) pushCycle(nextDue, true);

    // Projections only make sense for a bounded range (calendar views).
    if (!to) continue;

    let k = 0;
    let next = occurrence(item, k, timezone);
    while (!next.isAfter(nextDue)) next = occurrence(item, ++k, timezone);

    let count = 0;
    while (
      !next.isAfter(to) &&
      (!endDate || !next.isAfter(endDate)) &&
      count < MAX_OCCURRENCES_PER_ITEM
    ) {
      if (inRange(next, from, to)) pushCycle(next, false);
      next = occurrence(item, ++k, timezone);
      count++;
    }
  }

  return items;
};

/*
|--------------------------------------------------------------------------
| Recurring: detail / history / pay / skip
|--------------------------------------------------------------------------
*/
const findRecurring = async (userId, id) => {
  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id: Number(id), userId: Number(userId), isActive: true },
    include: {
      category: { select: categorySelect },
      fromAsset: { select: assetSelect },
      toAsset: { select: assetSelect },
    },
  });

  if (!recurring) throw new AppError("Scheduled transaction not found", 404);
  return recurring;
};

export const getRecurringSchedule = async (userId, id) => {
  const recurring = await findRecurring(userId, id);
  const account = getRecurringAccount(recurring);
  const balance = await getAssetRemainingBalance(userId, account?.id);

  return {
    id: recurring.id,
    source: "RECURRING",
    type: recurring.type,
    description: recurring.description,
    amount: Number(recurring.amount),
    dueDate: recurring.nextDueDate,
    nextDueDate: recurring.nextDueDate,
    startDate: recurring.startDate,
    endDate: recurring.endDate,
    interval: recurring.interval,
    unit: recurring.unit,
    behaviour: recurring.behaviour,
    category: recurring.category,
    // `account` is the one money moves out of (Expense/Transfer) or into (Income).
    account: account && {
      ...account,
      remainingBalance: balance?.remainingBalance ?? null,
    },
    ...recurringAssets(recurring),
  };
};

export const getRecurringScheduleHistory = async (userId, id) => {
  const recurring = await findRecurring(userId, id);
  const where = {
    recurringId: recurring.id,
    status: { in: ["Completed", "Skipped"] },
  };
  const select = { id: true, amount: true, date: true, status: true };

  const [expenses, incomes, transfers, skippedLogs] = await Promise.all([
    prisma.expense.findMany({
      where,
      select: { ...select, recurringDueDate: true },
    }),
    prisma.income.findMany({ where, select }),
    prisma.transfer.findMany({ where, select }),
    prisma.recurringLog.findMany({
      where: { recurringId: recurring.id, result: "SKIPPED" },
      select: { id: true, firedAt: true },
    }),
  ]);

  return [
    ...[...expenses, ...incomes, ...transfers].map((entry) => ({
      key: `tx-${entry.id}`,
      id: entry.id,
      amount: Number(entry.amount),
      date: entry.date,
      status: entry.status,
      dueDate: entry.recurringDueDate ?? null,
    })),
    ...skippedLogs.map((log) => ({
      key: `log-${log.id}`,
      id: log.id,
      amount: Number(recurring.amount),
      date: log.firedAt,
      status: "Skipped",
      dueDate: log.firedAt,
    })),
  ].sort(
    (a, b) => new Date(b.dueDate ?? b.date) - new Date(a.dueDate ?? a.date),
  );
};

export const payRecurringSchedule = async (userId, id, data) => {
  const recurring = await findRecurring(userId, id);
  const timezone = await getTimezone(userId);

  const amount = Number(data.amount);
  const date = new Date(data.date);
  const accountId = Number(data.account) || getRecurringAccount(recurring)?.id;
  const categoryId = Number(data.category) || recurring.categoryId;

  if (!accountId) throw new AppError("Account is required", 400);
  await validateCategory(categoryId);

  // Money leaves the account for Expense/Transfer, so check it can cover it.
  if (recurring.type !== "Income" && date <= new Date()) {
    await assertCanSpend(userId, accountId, amount);
  }

  if (recurring.type === "Transfer" && !recurring.toAssetId) {
    throw new AppError(
      "This scheduled transfer has no destination account",
      400,
    );
  }

  const common = {
    amount,
    date,
    description: data.description || recurring.description,
    status: date > new Date() ? "Pending" : "Completed",
    userId: Number(userId),
    categoryId,
    recurringId: recurring.id,
  };

  const created = await prisma.$transaction(async (tx) => {
    let entry;
    if (recurring.type === "Expense") {
      entry = await tx.expense.create({
        data: {
          ...common,
          assetId: accountId,
          recurringDueDate: recurring.nextDueDate,
        },
      });
    } else if (recurring.type === "Income") {
      entry = await tx.income.create({
        data: { ...common, assetId: accountId },
      });
    } else {
      entry = await tx.transfer.create({
        data: {
          ...common,
          fromAssetId: accountId,
          toAssetId: recurring.toAssetId,
        },
      });
    }

    const firedAt = currentCycleDate(recurring, timezone);
    await tx.recurringLog.upsert({
      where: { recurringId_firedAt: { recurringId: recurring.id, firedAt } },
      create: {
        recurringId: recurring.id,
        firedAt,
        result: "CREATED",
        [`generated${recurring.type}Id`]: entry.id,
      },
      update: {
        result: "CREATED",
        errorMessage: null,
        [`generated${recurring.type}Id`]: entry.id,
      },
    });

    await transactBill(recurring.id, userId, tx);
    return entry;
  });

  return created;
};

export const skipRecurringSchedule = async (userId, id) => {
  const recurring = await findRecurring(userId, id);
  const timezone = await getTimezone(userId);
  const firedAt = currentCycleDate(recurring, timezone);

  return prisma.$transaction(async (tx) => {
    const log = await tx.recurringLog.upsert({
      where: { recurringId_firedAt: { recurringId: recurring.id, firedAt } },
      create: { recurringId: recurring.id, firedAt, result: "SKIPPED" },
      update: { result: "SKIPPED", errorMessage: null },
    });

    await transactBill(recurring.id, userId, tx);
    return log;
  });
};
