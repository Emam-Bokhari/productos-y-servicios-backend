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

// Refund (Admins only)
router.post("/refund", isAdmin, DatafastControllers.refundTransaction);

export const DatafastRoutes = router;
