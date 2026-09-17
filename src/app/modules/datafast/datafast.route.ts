import express from "express";
import { DatafastControllers } from "./datafast.controller";
import { isAdmin, isAuthenticated, isUser } from "../../../helpers/authHelper";

const router = express.Router();

// Payment lifecycle
router.post(
  "/create-checkout-session",
  isAuthenticated,
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

// Hosted checkout page (Public view for WebView / browser)
router.get("/pay/:checkoutId", DatafastControllers.renderCheckoutPage);

// Hosted payment callback (Public - called upon COPYandPAY form submission)
router.get("/callback", DatafastControllers.handlePaymentCallback);
router.post("/callback", DatafastControllers.handlePaymentCallback);

// Refund (Admins only)
router.post("/refund", isAdmin, DatafastControllers.refundTransaction);

export const DatafastRoutes = router;
