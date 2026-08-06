import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { model, Schema } from "mongoose";
import { ITransaction, TransactionModel } from "./transaction.interface";
import { PAYMENT_METHOD, PAYMENT_STATUS, TRANSACTION_TYPE } from "./transaction.constant";

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
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: false,
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Ride",
      required: false,
      index: true,
    },
    rideId: {
      type: Schema.Types.ObjectId,
      ref: "Ride",
      required: false,
      index: true,
    },
    walletId: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
      required: false,
      index: true,
    },
    stripeCustomerId: {
      type: String,
      required: false,
    },
    stripeCheckoutSessionId: {
      type: String,
      required: false,
    },
    stripePaymentIntentId: {
      type: String,
      required: false,
    },
    stripeChargeId: {
      type: String,
      required: false,
    },
    stripeTransferId: {
      type: String,
      required: false,
    },
    stripePayoutId: {
      type: String,
      required: false,
    },
    stripeRefundId: {
      type: String,
      required: false,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalFare: {
      type: Number,
      required: false,
    },
    commission: {
      type: Number,
      required: false,
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

export const Transaction = model<ITransaction, TransactionModel>(
  "Transaction",
  transactionSchema,
);
