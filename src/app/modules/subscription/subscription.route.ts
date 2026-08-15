import express from "express";
import { isAuthenticated } from "../../../helpers/authHelper";
import { SubscriptionController } from "./subscription.controller";

const router = express.Router();


router.get(
  "/my-subscriptions",
  isAuthenticated,
  SubscriptionController.getMySubscriptions
);

export const SubscriptionRoutes = router;
