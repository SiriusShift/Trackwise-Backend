import { asyncHandler } from "../middleware/asyncHandler.js";
import * as notificationService from "../services/notification.service.js";

export const getNotifications = asyncHandler(async (req, res) => {
  const data = await notificationService.getNotifications(req.user.id, req.query);

  res.status(200).json({
    success: true,
    message: "Notifications fetched successfully",
    data,
  });
});

export const markAsRead = asyncHandler(async (req, res) => {
  await notificationService.markAsRead(req.user.id, Number(req.params.id));

  res.status(200).json({ success: true, message: "Notification marked as read" });
});

export const markAllAsRead = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user.id);

  res.status(200).json({ success: true, message: "All notifications marked as read" });
});

export const archiveNotification = asyncHandler(async (req, res) => {
  await notificationService.archiveNotification(req.user.id, Number(req.params.id));

  res.status(200).json({ success: true, message: "Notification archived" });
});
