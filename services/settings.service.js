import { prisma } from "../config/prisma.js";

const settingsSelect = {
  id: true,
  timezone: true,
  timeFormat: true,
  currency: true,
  weekStartDay: true,
  recurringBehaviour: true,
  emailNotification: true,
  mobileNotification: true,
  notifyDays: true,
  updatedAt: true,
};

/*
|--------------------------------------------------------------------------
| Get Settings
|--------------------------------------------------------------------------
| Creates default settings if the user doesn't have any yet.
*/
export const getSettings = async (userId) => {
  const settings = await prisma.settings.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: settingsSelect,
  });

  return settings;
};

/*
|--------------------------------------------------------------------------
| Update Settings
|--------------------------------------------------------------------------
*/
export const updateSettings = async (userId, data) => {
  const settings = await prisma.settings.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
    select: settingsSelect,
  });

  return settings;
};
