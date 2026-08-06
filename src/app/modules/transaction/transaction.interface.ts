import { ISoftDeleteModel } from "../../../types/softDelete";
import { Model, Types } from "mongoose";
import { PAYMENT_METHOD, PAYMENT_STATUS, TRANSACTION_TYPE } from "./transaction.constant";

export { TRANSACTION_TYPE };

export interface ITransaction {
  _id?: Types.ObjectId;
  transactionId: string; // Unique transaction reference (e.g. TXN-YYYYMMDD-XXXX)
  userId: Types.ObjectId; // User initiating/receiving the payment (ref: User)
  driverId?: Types.ObjectId; // Associated driver if applicable (ref: Driver)
  bookingId?: Types.ObjectId; // Associated ride/booking if applicable (ref: Ride)
  rideId?: Types.ObjectId; // Associated ride/booking (ref: Ride)
  walletId?: Types.ObjectId; // Associated wallet if applicable (ref: Wallet)
  stripeCustomerId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  stripeTransferId?: string;
  stripePayoutId?: string;
  stripeRefundId?: string;
  amount: number; // Transaction amount
  totalFare?: number; // Total fare for the ride (for driver earnings transactions)
  commission?: number;
  fee?: number;
  currency?: string;
  status?: string;
  paymentMethod: PAYMENT_METHOD; // Payment method used
  paymentStatus: PAYMENT_STATUS; // Status of the payment
  transactionType: TRANSACTION_TYPE; // Type of transaction
  gatewayTransactionId?: string; // ID from external gateway (e.g. Stripe charge/intent ID)
  gatewayResponse?: Record<string, any>; // Full response from payment gateway for audit log
  description?: string; // Optional description
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionModel = ISoftDeleteModel<ITransaction>;
