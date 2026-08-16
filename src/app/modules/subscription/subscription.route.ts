import express from "express";
import { isAdmin, isAuthenticated } from "../../../helpers/authHelper";
import { SubscriptionController } from "./subscription.controller";

const router = express.Router();

router.get(
  "/",
  isAdmin,
  SubscriptionController.getAllSubscriptions
);

router.get(
  "/my-subscriptions",
  isAuthenticated,
  SubscriptionController.getMySubscriptions
);

router.post(
  "/cancel/:id",
  isAuthenticated,
  SubscriptionController.cancelSubscription
);

router.get(
  "/:id",
  isAuthenticated,
  SubscriptionController.getSingleSubscription
);

export const SubscriptionRoutes = router;