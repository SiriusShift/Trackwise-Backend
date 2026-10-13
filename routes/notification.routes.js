import { Router } from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  archiveNotification,
} from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import catchAsync from "../utils/catchAsync.js";

const router = Router();

router.get("/", requireAuth, catchAsync(getNotifications));
// Registered before "/:id" routes so "read-all" isn't parsed as an id.
router.patch("/read-all", requireAuth, catchAsync(markAllAsRead));
router.patch("/:id/read", requireAuth, catchAsync(markAsRead));
router.delete("/:id", requireAuth, catchAsync(archiveNotification));

export default router;
