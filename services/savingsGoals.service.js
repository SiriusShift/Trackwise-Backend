import moment from "moment-timezone"; // NOTE: must be moment-timezone — plain "moment" has no .tz()
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { getUserTimezone } from "../utils/userTimezone.js";
import {
  ACCOUNT_RULES,
  assertAccountCategory,
  assertCanReceive,
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
// monthlyByGoalId holds each goal's contributions for the last TREND_MONTHS
// calendar months, oldest first (see monthlyContributions).
const withProgress = (
  goal,
  balanceByAssetId,
  monthlyByGoalId = new Map(),
  now = moment(),
) => {
  const assetBalance =
    goal.assetId != null ? balanceByAssetId.get(goal.assetId) : undefined;
  const savedAmount = assetBalance ?? Number(goal.currentAmount);
  const targetAmount = Number(goal.targetAmount);
  const isCompleted = targetAmount > 0 && savedAmount >= targetAmount;
  const remainingAmount = Math.max(targetAmount - savedAmount, 0);

  const monthlyContributions =
    monthlyByGoalId.get(goal.id) ?? Array(TREND_MONTHS).fill(0);
  const recentMonthlyPace = recentPaceOf(goal, monthlyContributions, now);
  const pace = monthlyPace(goal, savedAmount, remainingAmount);

  return {
    ...goal,
    savedAmount,
    remainingAmount,
    progress: targetAmount > 0 ? savedAmount / targetAmount : 0,
    isCompleted,
    isOnTrack:
      isCompleted ||
      isOnTrackFor(goal, savedAmount, targetAmount, pace.requiredMonthlyPace, recentMonthlyPace, now),
    ...pace,
    // Average contributed per month over the last PACE_MONTHS months (fewer
    // for younger goals). Unlike currentMonthlyPace it ignores an opening balance
    recentMonthlyPace,
    monthlyContributions,
  };
};

// The goal's age in calendar months, counting the current one
const ageInMonths = (goal, now) => {
  const created = moment(goal.createdAt).tz(now.tz() ?? moment.tz.guess());
  return now.clone().startOf("month").diff(created.startOf("month"), "months") + 1;
};

// Months in the pace window: PACE_MONTHS, or the goal's age in calendar months
// so a new goal isn't averaged over months it didn't exist
const recentPaceOf = (goal, monthly, now) => {
  const window = Math.min(PACE_MONTHS, Math.max(ageInMonths(goal, now), 1));
  return sum(monthly.slice(-window)) / window;
};

// Linked goals past their first month are judged by pace: on track only when
// recent contributions would finish in time, so the projected finish and the
// status always agree. The straight-line schedule counts a linked account's
// opening balance as progress, so it's only the fallback where there's no
// pace to go on: manual goals and linked goals created this month.
// Past-due unfinished goals are never on track.
const isOnTrackFor = (goal, savedAmount, targetAmount, required, recent, now) => {
  if (!goal.targetDate) return true;
  if (Date.now() >= new Date(goal.targetDate).getTime()) return false;
  if (goal.assetId != null && ageInMonths(goal, now) > 1) {
    return required != null && recent >= required;
  }
  return isOnPace(goal, savedAmount, targetAmount) || (required != null && recent >= required);
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

// A goal's tagged transfers either go into its account (contributions) or
// out of it (withdrawals). Checked against the goal's current account, so
// withdrawals made before a relink read as contributions.
const isWithdrawal = (transfer, goalAssetId) =>
  goalAssetId != null && transfer.fromAssetId === goalAssetId;

// Net goal contributions (contributions minus withdrawals) per calendar month in the user's timezone,
// oldest first, ending with the current month. `all` covers every goal;
// `dated` only the goals in datedGoalIds.
const monthlyContributions = async (userId, now, months, datedGoalIds) => {
  const start = now.clone().subtract(months - 1, "months").startOf("month");
  const transfers = await prisma.transfer.findMany({
    select: {
      amount: true,
      date: true,
      goalId: true,
      fromAssetId: true,
      goal: { select: { assetId: true } },
    },
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
  // Same series per goal, for the goal details chart and recent pace
  const byGoal = new Map();
  for (const t of transfers) {
    const i = moment(t.date).tz(now.tz()).diff(start, "months");
    if (i < 0 || i >= months) continue;
    // Withdrawals are tagged too and count against the month
    const amount = isWithdrawal(t, t.goal?.assetId)
      ? -Number(t.amount)
      : Number(t.amount);
    all[i] += amount;
    if (datedGoalIds.has(t.goalId)) dated[i] += amount;
    if (!byGoal.has(t.goalId)) byGoal.set(t.goalId, Array(months).fill(0));
    byGoal.get(t.goalId)[i] += amount;
  }
  return { all, dated, byGoal };
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

// withProgress for goals returned on their own (create, update, contribute)
const progressFor = async (userId, goal) => {
  const now = moment().tz(await getUserTimezone(userId));
  const [balances, contributions] = await Promise.all([
    balancesFor(userId, [goal]),
    monthlyContributions(userId, now, TREND_MONTHS, new Set()),
  ]);
  return withProgress(goal, balances, contributions.byGoal, now);
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

  // Summary cards only count active goals, even when archived ones are listed.
  // Total saved covers every goal; pace, progress and health only cover goals
  // with a target date, since the others have no schedule to measure against.
  const datedIds = new Set(
    goals.filter((g) => g.isActive && g.targetDate).map((g) => g.id),
  );
  const [balanceByAssetId, contributions] = await Promise.all([
    balancesFor(userId, goals),
    monthlyContributions(userId, now, TREND_MONTHS, datedIds),
  ]);
  const goalsWithProgress = goals.map((g) =>
    withProgress(g, balanceByAssetId, contributions.byGoal, now),
  );
  const active = goalsWithProgress.filter((g) => g.isActive);
  const dated = active.filter((g) => g.targetDate);

  const savedThisMonth = contributions.all[TREND_MONTHS - 1];
  const savedLastMonth = contributions.all[TREND_MONTHS - 2];

  const totalSaved = sum(active.map((g) => g.savedAmount));
  const savedHistory = savedHistoryOf(totalSaved, contributions.all);

  const datedSaved = sum(dated.map((g) => g.savedAmount));
  const totalTarget = sum(dated.map((g) => Number(g.targetAmount)));
  // Health only covers goals still being saved for; completed ones have no
  // schedule left to keep
  const pending = dated.filter((g) => !g.isCompleted);
  const onTrack = pending.filter((g) => g.isOnTrack).length;
  const neededPace = sum(dated.map((g) => g.requiredMonthlyPace));
  // Sum of each goal's recent pace, so the card matches the goal details.
  // Recent contributions rather than since creation, so a linked account's
  // opening balance doesn't count as pace
  const currentPace = sum(dated.map((g) => g.recentMonthlyPace));

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
      behindSchedule: pending.length - onTrack,
      // Last TREND_MONTHS months, oldest first, for the card sparklines
      trend: {
        saved: savedHistory,
        // Contributions to goals with a target date only
        pace: contributions.dated,
        progress: progressHistory,
        // One entry per unfinished active goal for the goal health dots. Goals
        // without a deadline are shown but not counted as on track or behind.
        health: active.filter((g) => !g.isCompleted).map((g) => ({
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

  return progressFor(userId, goal);
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

  return progressFor(userId, goal);
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
| Contribute to / Withdraw from Savings Goal
|--------------------------------------------------------------------------
| Both create a transfer tagged with the goal. A contribution moves money from
| `account` into the goal's linked account; a withdrawal moves it from the
| goal's account into `account`. The goal's side always comes from the goal,
| never the client.
*/
const GOAL_TRANSFER = {
  contribute: {
    verb: "contribute",
    archived: "Archived goals can't receive contributions",
    sameAccount: "Source account must be different from the goal's account",
    description: (goal) => `Contribution to ${goal.name}`,
  },
  withdraw: {
    verb: "withdraw",
    archived: "Archived goals can't be withdrawn from",
    sameAccount: "Destination account must be different from the goal's account",
    description: (goal) => `Withdrawal from ${goal.name}`,
  },
};

const goalTransfer = async (
  userId,
  id,
  { amount, account, category, date, description },
  direction,
) => {
  const rules = GOAL_TRANSFER[direction];
  const goal = await findGoal(userId, id);

  if (!goal.isActive) {
    throw new AppError(rules.archived, 400);
  }
  if (goal.assetId == null) {
    throw new AppError(
      `Link this goal to an account to ${rules.verb}, or update its saved amount instead`,
      400,
    );
  }

  const otherAssetId = Number(account);
  if (otherAssetId === goal.assetId) {
    throw new AppError(rules.sameAccount, 400);
  }

  const isContribution = direction === "contribute";
  const fromAssetId = isContribution ? otherAssetId : goal.assetId;
  const toAssetId = isContribution ? goal.assetId : otherAssetId;

  const txDate = date ? new Date(date) : new Date();
  const isPending = txDate > new Date();

  await validateCategory(category);
  await assertGoalAsset(userId, goal.assetId, goal.id);
  await assertAccountCategory(userId, fromAssetId, ACCOUNT_RULES.transferFrom);
  await assertAccountCategory(userId, toAssetId, ACCOUNT_RULES.transferTo);
  if (!isPending) {
    await assertCanSpend(userId, fromAssetId, amount);
    await assertCanReceive(userId, toAssetId, amount);
  }

  const transfer = await prisma.transfer.create({
    data: {
      amount: Number(amount),
      description: description || rules.description(goal),
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
    goal: await progressFor(userId, updated),
  };
};

export const contributeSavings = (userId, id, data) =>
  goalTransfer(userId, id, data, "contribute");

export const withdrawSavings = (userId, id, data) =>
  goalTransfer(userId, id, data, "withdraw");

/*
|--------------------------------------------------------------------------
| Get Goal Contributions
|--------------------------------------------------------------------------
| Latest transfers tagged with the goal, newest first. Includes scheduled
| (Pending) ones so upcoming contributions show up too, and withdrawals,
| marked by `type`.
*/
export const getGoalContributions = async (userId, id, { limit = 5 } = {}) => {
  const goal = await findGoal(userId, id);

  const transfers = await prisma.transfer.findMany({
    where: { userId: Number(userId), goalId: goal.id, isActive: true },
    select: {
      id: true,
      date: true,
      amount: true,
      description: true,
      status: true,
      recurringId: true,
      fromAsset: { select: { id: true, name: true } },
      toAsset: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(Number(limit) || 5, 1), 50),
  });

  return transfers.map((t) => ({
    ...t,
    amount: Number(t.amount),
    type: isWithdrawal({ fromAssetId: t.fromAsset.id }, goal.assetId)
      ? "withdrawal"
      : "contribution",
  }));
};
