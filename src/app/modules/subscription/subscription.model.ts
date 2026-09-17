import { model, Schema } from "mongoose";
import { TSubscription, SubscriptionModel } from "./subscription.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const subscriptionSchema = new Schema<TSubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPackage",
      required: true,
    },
    packageType: {
      type: String,
      enum: ["store_creation", "post_add"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "active",
        "inactive",
        "trialing",
        "past_due",
        "canceled",
        "expired",
      ],
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    cityConfigId: {
      type: Schema.Types.ObjectId,
      ref: "CityAdConfiguration",
      index: true,
    },
    position: {
      type: Number,
    },
    datafastRegistrationToken: {
      type: String,
      index: true,
    },
    checkoutSessionId: {
      type: String,
      index: true,
    },
    amountPaid: {
      type: Number,
    },
    trxId: {
      type: String,
    },
    invoiceNumber: {
      type: String,
      index: true,
    },
    invoiceUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

subscriptionSchema.plugin(softDeletePlugin);

// Compound indexes for dashboard and payment performance
subscriptionSchema.index({ status: 1, expiresAt: 1 });
subscriptionSchema.index({ createdAt: 1, amountPaid: 1 });
subscriptionSchema.index({ packageType: 1, status: 1, expiresAt: 1 });
subscriptionSchema.index({ packageType: 1, amountPaid: 1 });

export const Subscription = model<TSubscription, SubscriptionModel>(
  "Subscription",
  subscriptionSchema,
);
