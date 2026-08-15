import { Model, Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";

export interface INotificationPreference {
  userId: Types.ObjectId;

  // Channel preferences
  email: boolean;
  push: boolean;

  // Event preferences
  chatMessages: boolean;
  subscriptionUpdates: boolean;
  advertisementUpdates: boolean;
  reviewUpdates: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export type NotificationPreferenceModel =
  ISoftDeleteModel<INotificationPreference>;
