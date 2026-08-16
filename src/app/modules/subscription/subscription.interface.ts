import { Model, Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";

export type TSubscription = {
  userId: Types.ObjectId;
  packageId: Types.ObjectId;
  packageType: "store_creation" | "post_add";
  status:
    | "active"
    | "inactive"
    | "trialing"
    | "past_due"
    | "canceled"
    | "expired";
  expiresAt: Date;
  cityConfigId?: Types.ObjectId;
  stripeSubscriptionId?: string;
  stripeSessionId?: string;
  amountPaid?: number;
  trxId?: string;
};

export type SubscriptionModel = ISoftDeleteModel<TSubscription>;
