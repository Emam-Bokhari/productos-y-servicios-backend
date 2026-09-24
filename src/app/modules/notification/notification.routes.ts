import express from "express";
import auth from "../../middlewares/auth";
import { USER_ROLES } from "../../../enums/user";
import { NotificationController } from "./notification.controller";
const router = express.Router();

// user notification collection routes
router
  .route("/")
  .get(
    auth(
      USER_ROLES.USER,
      USER_ROLES.SELLER,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    NotificationController.getNotificationFromDB,
  )
  .patch(
    auth(
      USER_ROLES.USER,
      USER_ROLES.SELLER,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    NotificationController.readNotification,
  )
  .delete(
    auth(
      USER_ROLES.USER,
      USER_ROLES.SELLER,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    NotificationController.deleteNotification,
  );

router.get(
  "/recent",
  auth(
    USER_ROLES.USER,
    USER_ROLES.SELLER,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  NotificationController.getRecentActivities,
);

// message notification routes
router
  .route("/messages")
  .get(
    auth(
      USER_ROLES.USER,
      USER_ROLES.SELLER,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    NotificationController.getMessageNotifications,
  )
  .patch(
    auth(
      USER_ROLES.USER,
      USER_ROLES.SELLER,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    NotificationController.readMessageNotifications,
  )
  .delete(
    auth(
      USER_ROLES.USER,
      USER_ROLES.SELLER,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    NotificationController.deleteMessageNotifications,
  );

router.patch(
  "/messages/read",
  auth(
    USER_ROLES.USER,
    USER_ROLES.SELLER,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  NotificationController.readMessageNotifications,
);

// admin routes
router
  .route("/admin")
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminNotificationFromDB,
  )
  .patch(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminReadNotification,
  )
  .delete(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminDeleteNotification,
  );

router.get(
  "/admin/recent",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  NotificationController.adminRecentActivities,
);

router
  .route("/admin/:id")
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminGetSingleNotification,
  )
  .delete(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    NotificationController.adminDeleteSingleNotification,
  );

router.patch(
  "/admin/:id/read",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  NotificationController.adminReadSingleNotification,
);

// user single routes
router
  .route("/:id")
  .get(
    auth(
      USER_ROLES.USER,
      USER_ROLES.SELLER,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    NotificationController.getSingleNotification,
  )
  .delete(
    auth(
      USER_ROLES.USER,
      USER_ROLES.SELLER,
      USER_ROLES.ADMIN,
      USER_ROLES.SUPER_ADMIN,
    ),
    NotificationController.deleteSingleNotification,
  );

router.patch(
  "/:id/read",
  auth(
    USER_ROLES.USER,
    USER_ROLES.SELLER,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ),
  NotificationController.readSingleNotification,
);

export const NotificationRoutes = router;
