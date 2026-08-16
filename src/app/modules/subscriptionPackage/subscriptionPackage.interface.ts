import { ISoftDeleteModel } from "../../../types/softDelete";
import {
  SUBSCRIPTION_PACKAGE_DURATION,
  SUBSCRIPTION_PACKAGE_STATUS,
  SUBSCRIPTION_PACKAGE_TYPE,
} from "./subscriptionPackage.constant";

export type TSubscriptionPackage = {
  name: string;
  price: number;
  duration: SUBSCRIPTION_PACKAGE_DURATION;
  status: SUBSCRIPTION_PACKAGE_STATUS;
  packageType: SUBSCRIPTION_PACKAGE_TYPE;
  listingLimit?: number;
  isUnlimitedListings?: boolean;
  trialEnabled?: boolean;
  trialPeriodDays?: number;
  stripeProductId?: string;
  stripePriceId?: string;
  features?: string[];
};

export type SubscriptionPackageModel = ISoftDeleteModel<TSubscriptionPackage>;
