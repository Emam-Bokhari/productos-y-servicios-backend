import { Types } from "mongoose";
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
  position?: number;
  stripeSubscriptionId?: string;
  datafastRegistrationToken?: string;
  stripeSessionId?: string;
  amountPaid?: number;
  trxId?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}; 

export type SubscriptionModel = ISoftDeleteModel<TSubscription>;