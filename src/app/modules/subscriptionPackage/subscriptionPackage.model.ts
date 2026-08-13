import { model, Schema } from "mongoose";
import {
  TSubscriptionPackage,
  SubscriptionPackageModel,
} from "./subscriptionPackage.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const subscriptionPackageSchema = new Schema<TSubscriptionPackage>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    duration: {
      type: String,
      enum: ["1 month", "3 month", "6 month", "1 year"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    trialPeriodDays: {
      type: Number,
      default: 0,
    },
    stripeProductId: {
      type: String,
      required: false,
    },
    stripePriceId: {
      type: String,
      required: false,
    },
    features: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Enable soft delete plugin
subscriptionPackageSchema.plugin(softDeletePlugin);

export const SubscriptionPackage = model<
  TSubscriptionPackage,
  SubscriptionPackageModel
>("SubscriptionPackage", subscriptionPackageSchema);
