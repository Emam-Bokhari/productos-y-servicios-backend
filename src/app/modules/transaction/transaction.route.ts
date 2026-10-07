import express from "express";
import { isAdmin, isAuthenticated } from "../../../helpers/authHelper";
import { TransactionController } from "./transaction.controller";

const router = express.Router();

// ==========================================
// APP / USER / SELLER ROUTES (Authenticated)
// ==========================================

// Get logged-in user's transaction history (both subscriptions & post ads)
router.get(
  "/my-transactions",
  isAuthenticated,
  TransactionController.getMyTransactions,
);

// Alias for /my-transactions
router.get(
  "/me",
  isAuthenticated,
  TransactionController.getMyTransactions,
);

// Get specific transaction for user
router.get(
  "/my-transactions/:id",
  isAuthenticated,
  TransactionController.getSingleTransaction,
);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Admin overview of all transactions
router.get("/", isAdmin, TransactionController.getAllSubscriptionTransactions);

// Admin refund
router.post("/refund/:id", isAdmin, TransactionController.refundTransaction);

// ==========================================
// DETAIL ROUTE (Owner or Admin)
// ==========================================
router.get("/:id", isAuthenticated, TransactionController.getSingleTransaction);

export const TransactionRoutes = router;