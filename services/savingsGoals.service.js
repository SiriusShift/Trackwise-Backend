import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { getUserTimezone } from "../utils/userTimezone.js";
import {
  ACCOUNT_RULES,
  assertAccountCategory,
  assertCanSpend,
  getAssetBalance,
  isLiabilityCategory,
  validateAsset,
} from "./assets.service.js";
import { validateCategory } from "./categories.service.js";
import moment from "moment-timezone"; // NOTE: must be moment-timezone — plain "moment" has no .tz()

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/
const findGoal = async (userId, id) => {
  const goal = await prisma.savingsGoal.findFirst({
    where: { id: Number(id), userId: Number(userId) },
  });

  if (!goal) {
    throw new AppError("Savings goal not found", 404);
  }

  return goal;
};

// A goal can only track an active account the user owns that holds money
const assertGoalAsset = async (userId, assetId) => {
  const asset = await validateAsset(assetId, userId);
  if (!asset.isActive) {
    throw new AppError("Archived accounts can't be linked to a goal", 400);
  }
  if (isLiabilityCategory(asset.category)) {
    throw new AppError(
      "Goals can't be linked to a credit or loan account",
      400,
    );
  }
  return asset;
};

const goalSelect = {
  id: true,
  name: true,
  targetAmount: true,
  targetDate: true,
  currentAmount: true,
  isActive: true,
  icon: true,
  assetId: true,
  asset: { select: { id: true, name: true, currency: true, isActive: true } },
  createdAt: true,
  updatedAt: true,
};

// Saved amount is the linked asset's balance, or the hand-entered amount
// for goals without one (or whose asset is archived).
const withProgress = (goal, balanceByAssetId) => {
  const assetBalance =
    goal.assetId != null ? balanceByAssetId.get(goal.assetId) : undefined;
  const savedAmount = assetBalance ?? Number(goal.currentAmount);
  const targetAmount = Number(goal.targetAmount);
  const isCompleted = targetAmount > 0 && savedAmount >= targetAmount;

  return {
    ...goal,
    savedAmount,
    remainingAmount: Math.max(targetAmount - savedAmount, 0),
    progress: targetAmount > 0 ? savedAmount / targetAmount : 0,
    isCompleted,
    isOnTrack: isCompleted || isOnPace(goal, savedAmount, targetAmount),
  };
};

// On track when saved >= where a straight line from createdAt to targetDate
// says it should be by now. Goals without a deadline are always on track.
const isOnPace = (goal, savedAmount, targetAmount) => {
  if (!goal.targetDate) return true;

  const start = new Date(goal.createdAt).getTime();
  const end = new Date(goal.targetDate).getTime();
  const now = Date.now();
  if (now >= end) return false;

  const elapsed = end > start ? (now - start) / (end - start) : 1;
  const expected = targetAmount * Math.min(Math.max(elapsed, 0), 1);
  return savedAmount >= expected;
};

// Sum of completed goal contributions dated within [start, end]
const contributionsBetween = async (userId, start, end) => {
  const { _sum } = await prisma.transfer.aggregate({
    _sum: { amount: true },
    where: {
      userId: Number(userId),
      goalId: { not: null },
      isActive: true,
      status: "Completed",
      date: { gte: start.toDate(), lte: end.toDate() },
    },
  });
  return Number(_sum.amount ?? 0);
};

const balancesFor = async (userId, goals) => {
  if (!goals.some((g) => g.assetId != null)) return new Map();
  const { data } = await getAssetBalance(userId, null);
  return new Map(data.map((a) => [a.id, a.remainingBalance]));
};

/*
|--------------------------------------------------------------------------
| Get Savings Goals
|--------------------------------------------------------------------------
*/
export const getSavingsGoals = async (
  userId,
  { isActive = false } = {},
) => {
  const timezone = await getUserTimezone(userId);
  const now = moment().tz(timezone);
  const lastMonth = now.clone().subtract(1, "month");

  const goals = await prisma.savingsGoal.findMany({
    where: {
      userId: Number(userId),
      ...(isActive && { isActive: true }),
    },
    select: goalSelect,
    orderBy: [
      { targetDate: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });

  const balanceByAssetId = await balancesFor(userId, goals);
  const goalsWithProgress = goals.map((g) => withProgress(g, balanceByAssetId));
  const [savedThisMonth, savedLastMonth] = await Promise.all([
    contributionsBetween(userId, now.clone().startOf("month"), now.clone().endOf("month")),
    contributionsBetween(userId, lastMonth.clone().startOf("month"), lastMonth.clone().endOf("month")),
  ]);

  // Summary cards only count active goals, even when archived ones are listed
  const active = goalsWithProgress.filter((g) => g.isActive);
  const totalSaved = active.reduce((sum, g) => sum + g.savedAmount, 0);
  const totalTarget = active.reduce((sum, g) => sum + Number(g.targetAmount), 0);
  const onTrack = active.filter((g) => g.isOnTrack).length;

  return {
    data: goalsWithProgress,
    summary: {
      totalSaved,
      activeGoals: active.length,
      savedThisMonth,
      savedLastMonth,
      // null when there's nothing last month to compare against
      monthOverMonthChange:
        savedLastMonth > 0 ? (savedThisMonth - savedLastMonth) / savedLastMonth : null,
      totalTarget,
      overallProgress: totalTarget > 0 ? Math.min(totalSaved / totalTarget, 1) : 0,
      onTrack,
      behindSchedule: active.length - onTrack,
    },
  };
};

/*
|--------------------------------------------------------------------------
| Create Savings Goal
|--------------------------------------------------------------------------
*/
export const createSavingsGoal = async (
  userId,
  { name, targetAmount, targetDate, icon, assetId, currentAmount },
) => {
  if (assetId != null) {
    await assertGoalAsset(userId, assetId);
  }

  const goal = await prisma.savingsGoal.create({
    data: {
      name,
      targetAmount: parseFloat(targetAmount),
      targetDate: targetDate ? new Date(targetDate) : null,
      ...(icon !== undefined && { icon }),
      currentAmount: currentAmount != null ? parseFloat(currentAmount) : 0,
      userId: Number(userId),
      assetId: assetId != null ? Number(assetId) : null,
    },
    select: goalSelect,
  });

  return withProgress(goal, await balancesFor(userId, [goal]));
};

/*
|--------------------------------------------------------------------------
| Update Savings Goal
|--------------------------------------------------------------------------
| isActive false archives the goal; true restores it.
*/
export const updateSavingsGoal = async (
  userId,
  id,
  { name, targetAmount, targetDate, icon, assetId, currentAmount, isActive },
) => {
  const existing = await findGoal(userId, id);

  if (assetId != null && assetId !== existing.assetId) {
    await assertGoalAsset(userId, assetId);
  }

  const goal = await prisma.savingsGoal.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined && { name }),
      ...(targetAmount !== undefined && {
        targetAmount: parseFloat(targetAmount),
      }),
      ...(targetDate !== undefined && {
        targetDate: targetDate ? new Date(targetDate) : null,
      }),
      ...(icon !== undefined && { icon }),
      ...(assetId !== undefined && {
        assetId: assetId != null ? Number(assetId) : null,
      }),
      ...(currentAmount !== undefined && {
        currentAmount: parseFloat(currentAmount),
      }),
      ...(isActive !== undefined && { isActive }),
    },
    select: goalSelect,
  });

  return withProgress(goal, await balancesFor(userId, [goal]));
};

/*
|--------------------------------------------------------------------------
| Delete Savings Goal
|--------------------------------------------------------------------------
*/
export const deleteSavingsGoal = async (userId, id) => {
  const goal = await findGoal(userId, id);
  await prisma.savingsGoal.delete({ where: { id: goal.id } });
};

/*
|--------------------------------------------------------------------------
| Contribute to Savings Goal
|--------------------------------------------------------------------------
| Creates a transfer from `account` into the goal's linked account, tagged
| with the goal. The destination always comes from the goal, never the client.
*/
export const contributeSavings = async (
  userId,
  id,
  { amount, account, category, date, description },
) => {
  const goal = await findGoal(userId, id);

  if (!goal.isActive) {
    throw new AppError("Archived goals can't receive contributions", 400);
  }
  if (goal.assetId == null) {
    throw new AppError(
      "Link this goal to an account to contribute, or update its saved amount instead",
      400,
    );
  }

  const fromAssetId = Number(account);
  const toAssetId = goal.assetId;
  if (fromAssetId === toAssetId) {
    throw new AppError(
      "Source account must be different from the goal's account",
      400,
    );
  }

  const txDate = date ? new Date(date) : new Date();
  const isPending = txDate > new Date();

  await validateCategory(category);
  await assertGoalAsset(userId, toAssetId);
  await assertAccountCategory(userId, fromAssetId, ACCOUNT_RULES.transferFrom);
  if (!isPending) {
    await assertCanSpend(userId, fromAssetId, amount);
  }

  const transfer = await prisma.transfer.create({
    data: {
      amount: Number(amount),
      description: description || `Contribution to ${goal.name}`,
      date: txDate,
      status: isPending ? "Pending" : "Completed",
      userId: Number(userId),
      categoryId: Number(category),
      fromAssetId,
      toAssetId,
      goalId: goal.id,
    },
  });

  const updated = await prisma.savingsGoal.findUnique({
    where: { id: goal.id },
    select: goalSelect,
  });

  return {
    transfer,
    goal: withProgress(updated, await balancesFor(userId, [updated])),
  };
};
