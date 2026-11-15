import moment from "moment-timezone";

import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { getAssetBalance } from "../assets.service.js";
import { validateCategory } from "../categories.service.js";

/*
|--------------------------------------------------------------------------
| Shared by every schedule source
|--------------------------------------------------------------------------
*/
export const categorySelect = { id: true, name: true, icon: true, color: true };
export const assetSelect = {
  id: true,
  name: true,
  category: true,
  color: true,
};

export const getTimezone = async (userId) => {
  const settings = await prisma.settings.findFirst({
    where: { userId: Number(userId) },
    select: { timezone: true },
  });
  return settings?.timezone || "UTC";
};

export const getAssetRemainingBalance = async (userId, assetId, options) => {
  if (!assetId) return null;
  const result = await getAssetBalance(userId, assetId, options);
  return result?.data?.[0] ?? null;
};

export const inRange = (date, from, to) =>
  (!from || !moment(date).isBefore(from)) && (!to || !moment(date).isAfter(to));

export const resolveTransferCategory = async (userId, categoryId) => {
  if (categoryId) {
    await validateCategory(categoryId);
    return Number(categoryId);
  }

  const category = await prisma.categories.findFirst({
    where: {
      isActive: true,
      type: { equals: "Transfer", mode: "insensitive" },
      OR: [{ userId: null }, { userId: Number(userId) }],
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  if (!category)
    throw new AppError("No transfer category available for this payment", 400);
  return category.id;
};
