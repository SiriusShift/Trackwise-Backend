import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";

const MAX_LIMIT = 50;

export const getNotifications = async (userId, { limit } = {}) => {
  const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), MAX_LIMIT);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({
      where: { userId, isArchived: false, isRead: false },
    }),
  ]);

  return { items, unreadCount };
};

export const markAsRead = async (userId, id) => {
  // updateMany scopes the write to the owner, so other users' ids are never touched.
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true, readAt: new Date() },
  });
  if (result.count === 0) throw new AppError("Notification not found.", 404);
};

export const markAllAsRead = async (userId) => {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
};

export const archiveNotification = async (userId, id) => {
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isArchived: true },
  });
  if (result.count === 0) throw new AppError("Notification not found.", 404);
};
