import { ISoftDeleteModel } from "../../../types/softDelete";
import { Model, Types } from "mongoose";
import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  TRANSACTION_TYPE,
} from "./transaction.constant";

export { TRANSACTION_TYPE };

export interface ITransaction {
  _id?: Types.ObjectId;
  transactionId: string; // Unique transaction reference (e.g. INV-YYYY-XXXX)
  userId: Types.ObjectId; // User initiating/receiving the payment (ref: User)
  packageId?: Types.ObjectId; // Associated subscription package (ref: SubscriptionPackage)
  storeId?: Types.ObjectId; // Associated seller store (ref: Store)
  customerId?: string; // Gateway customer / registration token (ref: Datafast registrationId)
  checkoutSessionId?: string; // Gateway checkout session ID
  amount: number; // Transaction amount
  fee?: number;
  currency?: string;
  status?: string;
  paymentMethod: PAYMENT_METHOD; // Payment method used
  paymentStatus: PAYMENT_STATUS; // Status of the payment
  transactionType: TRANSACTION_TYPE; // Type of transaction
  gatewayTransactionId?: string; // ID from external payment gateway (e.g. Datafast transaction ID)
  gatewayResponse?: Record<string, any>; // Full response from payment gateway for audit log
  description?: string; // Optional description
  metadata?: Record<string, any>;
  invoiceUrl?: string; // Generated PDF invoice URL (e.g. /uploads/invoices/INV-2026-1001.pdf)
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionModel = ISoftDeleteModel<ITransaction>;
