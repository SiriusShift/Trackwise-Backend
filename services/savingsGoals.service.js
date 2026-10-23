import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  getAssetBalance,
  isLiabilityCategory,
  validateAsset,
} from "./assets.service.js";

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
    throw new AppError("Goals can't be linked to a credit or loan account", 400);
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
  assetId: true,
  asset: { select: { id: true, name: true, currency: true, isActive: true } },
  createdAt: true,
  updatedAt: true,
};

// Saved amount is the linked asset's balance, or the hand-entered amount
// for goals without one (or whose asset is archived).
const withProgress = (goal, balanceByAssetId) => {
  const assetBalance = goal.assetId != null
    ? balanceByAssetId.get(goal.assetId)
    : undefined;
  const savedAmount = assetBalance ?? Number(goal.currentAmount);
  const targetAmount = Number(goal.targetAmount);

  return {
    ...goal,
    savedAmount,
    remainingAmount: Math.max(targetAmount - savedAmount, 0),
    progress: targetAmount > 0 ? savedAmount / targetAmount : 0,
  };
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
export const getSavingsGoals = async (userId, { includeInactive = false } = {}) => {
  const goals = await prisma.savingsGoal.findMany({
    where: {
      userId: Number(userId),
      ...(!includeInactive && { isActive: true }),
    },
    select: goalSelect,
    orderBy: [{ targetDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  const balanceByAssetId = await balancesFor(userId, goals);
  return goals.map((g) => withProgress(g, balanceByAssetId));
};

/*
|--------------------------------------------------------------------------
| Create Savings Goal
|--------------------------------------------------------------------------
*/
export const createSavingsGoal = async (
  userId,
  { name, targetAmount, targetDate, assetId, currentAmount },
) => {
  if (assetId != null) {
    await assertGoalAsset(userId, assetId);
  }

  const goal = await prisma.savingsGoal.create({
    data: {
      name,
      targetAmount: parseFloat(targetAmount),
      targetDate: targetDate ? new Date(targetDate) : null,
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
  { name, targetAmount, targetDate, assetId, currentAmount, isActive },
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
