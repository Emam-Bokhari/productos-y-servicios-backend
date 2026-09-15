import express from "express";
import { USER_ROLES } from "../../../enums/user";
import { StripeControllers } from "./stripe.controller";
import { DatafastControllers } from "../datafast/datafast.controller";
import auth from "../../middlewares/auth";
import {
  isAdmin,
  isAuthenticated,
  isSeller,
  isUser,
} from "../../../helpers/authHelper";

const router = express.Router();

// Seller onboarding / express dashboard links
router.post(
  "/connect-account",
  isSeller,
  StripeControllers.createStripeAccount,
);

router.get(
  "/dashboard",
  isAuthenticated,
  StripeControllers.getStripeDashboardLink,
);

// only use for testing purpose
router.get(
  "/account-details",
  isAuthenticated,
  StripeControllers.getAccountDetails,
);

// Payment lifecycle (Powered by Datafast)
router.post(
  "/create-checkout-session",
  isUser,
  DatafastControllers.createCheckoutSession,
);

router.post(
  "/verify-payment",
  isAuthenticated,
  DatafastControllers.verifyPayment,
);

router.get(
  "/payment-status/:id",
  isAuthenticated,
  DatafastControllers.getPaymentStatus,
);

// Refund (Admins only)
router.post("/refund", isAdmin, DatafastControllers.refundTransaction);

// Stripe Webhook Endpoint (Optional / legacy)
router.post("/webhook", StripeControllers.handleWebhook);

export const StripeRoutes = router;
