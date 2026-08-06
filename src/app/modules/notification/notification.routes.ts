import express from "express";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { NotificationController } from "./notification.controller";
const router = express.Router();

router
  .route("/")
  .get(
    auth(USER_ROLES.USER, USER_ROLES.SELLER),
    NotificationController.getNotificationFromDB,
  )
  .patch(
    auth(USER_ROLES.USER, USER_ROLES.SELLER),
    NotificationController.readNotification,
  );

router.get(
  "/recent",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  NotificationController.getRecentActivities,
);

router
  .route("/admin")
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminNotificationFromDB,
  )
  .patch(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminReadNotification,
  );

router.get(
  "/admin/recent",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  NotificationController.adminRecentActivities,
);

// user routes
router.get(
  "/:id",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  NotificationController.getSingleNotification,
);

router.patch(
  "/:id/read",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  NotificationController.readSingleNotification,
);

// admin routes
router.get(
  "/admin/:id",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  NotificationController.adminGetSingleNotification,
);

router.patch(
  "/admin/:id/read",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  NotificationController.adminReadSingleNotification,
);

export const NotificationRoutes = router;
