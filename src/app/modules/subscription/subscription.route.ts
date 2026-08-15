import express from "express";
import { isAuthenticated } from "../../../helpers/authHelper";
import { SubscriptionController } from "./subscription.controller";

const router = express.Router();


router.get(
  "/my-subscriptions",
  isAuthenticated,
  SubscriptionController.getMySubscriptions
);

router.get(
  "/:id",
  isAuthenticated,
  SubscriptionController.getSingleSubscription
);

export const SubscriptionRoutes = router;