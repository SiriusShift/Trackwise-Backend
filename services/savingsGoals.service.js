import moment from "moment-timezone"; // NOTE: must be moment-timezone — plain "moment" has no .tz()
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

// A goal can only track an active account the user owns that holds money,
// and no other goal may track it: a goal's saved amount is the account's
// whole balance, so sharing one would count that balance twice.
// goalId is the goal being edited, which may keep its own account.
const assertGoalAsset = async (userId, assetId, goalId = null) => {
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

  // Archived goals count too, so restoring one can't create a duplicate
  const linkedGoal = await prisma.savingsGoal.findFirst({
    where: {
      userId: Number(userId),
      assetId: Number(assetId),
      ...(goalId != null && { id: { not: Number(goalId) } }),
    },
    select: { name: true, isActive: true },
  });
  if (linkedGoal) {
    throw new AppError(
      `This account is already linked to the ${linkedGoal.isActive ? "" : "archived "}goal "${linkedGoal.name}"`,
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
  const remainingAmount = Math.max(targetAmount - savedAmount, 0);

  return {
    ...goal,
    savedAmount,
    remainingAmount,
    progress: targetAmount > 0 ? savedAmount / targetAmount : 0,
    isCompleted,
    isOnTrack: isCompleted || isOnPace(goal, savedAmount, targetAmount),
    ...monthlyPace(goal, savedAmount, remainingAmount),
  };
};

// requiredMonthlyPace: what must be saved per month from now to hit the target
// on time (null without a deadline). currentMonthlyPace: average saved per
// month since the goal was created. Both floor the month count at 1 so the
// first and last few days don't produce huge numbers.
const monthlyPace = (goal, savedAmount, remainingAmount) => {
  const now = moment();
  const monthsElapsed = Math.max(now.diff(moment(goal.createdAt), "months", true), 1);
  const monthsLeft = goal.targetDate
    ? Math.max(moment(goal.targetDate).diff(now, "months", true), 1)
    : null;

  return {
    requiredMonthlyPace: monthsLeft != null ? remainingAmount / monthsLeft : null,
    currentMonthlyPace: savedAmount / monthsElapsed,
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

// Number of monthly points in the summary card sparklines
const TREND_MONTHS = 6;
// Months averaged for the actual pace compared against the pace needed
const PACE_MONTHS = 3;

const sum = (values) => values.reduce((total, v) => total + v, 0);

// Completed goal contributions per calendar month in the user's timezone,
// oldest first, ending with the current month. `all` covers every goal;
// `dated` only the goals in datedGoalIds.
const monthlyContributions = async (userId, now, months, datedGoalIds) => {
  const start = now.clone().subtract(months - 1, "months").startOf("month");
  const transfers = await prisma.transfer.findMany({
    select: { amount: true, date: true, goalId: true },
    where: {
      userId: Number(userId),
      goalId: { not: null },
      isActive: true,
      status: "Completed",
      date: { gte: start.toDate(), lte: now.clone().endOf("month").toDate() },
    },
  });

  const all = Array(months).fill(0);
  const dated = Array(months).fill(0);
  for (const t of transfers) {
    const i = moment(t.date).tz(now.tz()).diff(start, "months");
    if (i < 0 || i >= months) continue;
    all[i] += Number(t.amount);
    if (datedGoalIds.has(t.goalId)) dated[i] += Number(t.amount);
  }
  return { all, dated };
};

// Saved total at the end of each month, estimated by taking later
// contributions back out of today's total (no balance history is stored).
const savedHistoryOf = (savedNow, contributions) =>
  contributions.map((_, i) => savedNow - sum(contributions.slice(i + 1)));

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
  // Summary cards only count active goals, even when archived ones are listed.
  // Total saved covers every goal; pace, progress and health only cover goals
  // with a target date, since the others have no schedule to measure against.
  const active = goalsWithProgress.filter((g) => g.isActive);
  const dated = active.filter((g) => g.targetDate);

  const contributions = await monthlyContributions(
    userId,
    now,
    TREND_MONTHS,
    new Set(dated.map((g) => g.id)),
  );
  const savedThisMonth = contributions.all[TREND_MONTHS - 1];
  const savedLastMonth = contributions.all[TREND_MONTHS - 2];

  const totalSaved = sum(active.map((g) => g.savedAmount));
  const savedHistory = savedHistoryOf(totalSaved, contributions.all);

  const datedSaved = sum(dated.map((g) => g.savedAmount));
  const totalTarget = sum(dated.map((g) => Number(g.targetAmount)));
  const onTrack = dated.filter((g) => g.isOnTrack).length;
  const neededPace = sum(dated.map((g) => g.requiredMonthlyPace));
  // Average of recent months rather than since each goal was created, so a
  // linked account's opening balance doesn't count as pace
  const currentPace = sum(contributions.dated.slice(-PACE_MONTHS)) / PACE_MONTHS;

  const progressOf = (saved) => (totalTarget > 0 ? Math.min(Math.max(saved, 0) / totalTarget, 1) : 0);
  const progressHistory = savedHistoryOf(datedSaved, contributions.dated).map(progressOf);
  const overallProgress = progressHistory[TREND_MONTHS - 1];
  const progressLastMonth = progressHistory[TREND_MONTHS - 2];

  return {
    data: goalsWithProgress,
    summary: {
      totalSaved,
      activeGoals: active.length,
      // Active goals with a target date: the ones pace, progress and health cover
      datedGoals: dated.length,
      savedThisMonth,
      savedLastMonth,
      // null when there's nothing last month to compare against
      monthOverMonthChange: savedLastMonth > 0 ? (savedThisMonth - savedLastMonth) / savedLastMonth : null,
      neededPace,
      currentPace,
      totalTarget,
      overallProgress,
      // Percentage points gained this month, e.g. 0.08 = +8 pts
      progressChange: overallProgress - progressLastMonth,
      onTrack,
      behindSchedule: dated.length - onTrack,
      // Last TREND_MONTHS months, oldest first, for the card sparklines
      trend: {
        saved: savedHistory,
        // Contributions to goals with a target date only
        pace: contributions.dated,
        progress: progressHistory,
        // One entry per active goal for the goal health dots. Goals without a
        // deadline are shown but not counted as on track or behind.
        health: active.map((g) => ({
          id: g.id,
          name: g.name,
          status: !g.targetDate ? "noDeadline" : g.isOnTrack ? "onTrack" : "behind",
        })),
      },
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
    await assertGoalAsset(userId, assetId, existing.id);
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
  await assertGoalAsset(userId, toAssetId, goal.id);
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
