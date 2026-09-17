import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { model, Schema } from "mongoose";
import { ITransaction, TransactionModel } from "./transaction.interface";
import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  TRANSACTION_TYPE,
} from "./transaction.constant";

const transactionSchema = new Schema<ITransaction, TransactionModel>(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPackage",
      required: false,
      index: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: false,
      index: true,
    },
    customerId: {
      type: String,
      required: false,
    },
    checkoutSessionId: {
      type: String,
      required: false,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    fee: {
      type: Number,
      required: false,
    },
    currency: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: false,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      default: PAYMENT_METHOD.DATAFAST,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: Object.values(TRANSACTION_TYPE),
      required: true,
      index: true,
    },
    gatewayTransactionId: {
      type: String,
      required: false,
      index: true,
    },
    gatewayResponse: {
      type: Schema.Types.Mixed,
      required: false,
    },
    description: {
      type: String,
      required: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
    invoiceUrl: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.id;
        return ret;
      },
    },
  },
);

transactionSchema.plugin(softDeletePlugin);

// Indexes for query performance
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ paymentStatus: 1, createdAt: -1 });
transactionSchema.index({ checkoutSessionId: 1 }, { sparse: true });
transactionSchema.index({ gatewayTransactionId: 1 }, { sparse: true });

export const Transaction = model<ITransaction, TransactionModel>(
  "Transaction",
  transactionSchema,
);
