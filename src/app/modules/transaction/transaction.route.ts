import express from "express";
import { isAdmin } from "../../../helpers/authHelper";
import { TransactionController } from "./transaction.controller";

const router = express.Router();

router.get(
  "/",
  isAdmin,
  TransactionController.getAllSubscriptionTransactions
);

router.post(
  "/refund/:id",
  isAdmin,
  TransactionController.refundTransaction
);

export const TransactionRoutes = router;
