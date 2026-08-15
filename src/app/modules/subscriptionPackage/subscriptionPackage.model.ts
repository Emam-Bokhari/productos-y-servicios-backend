import { model, Schema } from "mongoose";
import {
  TSubscriptionPackage,
  SubscriptionPackageModel,
} from "./subscriptionPackage.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import {
  SUBSCRIPTION_PACKAGE_DURATION,
  SUBSCRIPTION_PACKAGE_STATUS,
  SUBSCRIPTION_PACKAGE_TYPE,
} from "./subscriptionPackage.constant";

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
      enum: Object.values(SUBSCRIPTION_PACKAGE_DURATION),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PACKAGE_STATUS),
      default: SUBSCRIPTION_PACKAGE_STATUS.ACTIVE,
    },
    packageType: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PACKAGE_TYPE),
      required: true,
    },
    listingLimit: {
      type: Number,
      default: 0,
    },
    isUnlimitedListings: {
      type: Boolean,
      default: false,
    },
    trialEnabled: {
      type: Boolean,
      default: false,
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
