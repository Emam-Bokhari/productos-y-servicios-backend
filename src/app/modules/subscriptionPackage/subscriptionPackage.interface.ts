import { ISoftDeleteModel } from "../../../types/softDelete";

export type TSubscriptionPackage = {
  name: string;
  price: number;
  duration: "1 month" | "3 month" | "6 month" | "1 year";
  status: "active" | "inactive";
  trialPeriodDays?: number;
  stripeProductId?: string;
  stripePriceId?: string;
  features?: string[];
};

export type SubscriptionPackageModel = ISoftDeleteModel<TSubscriptionPackage>;
