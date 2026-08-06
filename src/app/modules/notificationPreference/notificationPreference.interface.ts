import { Model, Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";

export interface INotificationPreference {
  userId: Types.ObjectId;

  // Channel preferences
  email: boolean;
  push: boolean;
  // sms: boolean;

  // Ride-sharing event preferences
  newRideRequests: boolean; // For drivers
  rideUpdates: boolean; // For passengers
  chatMessages: boolean; // For both
  paymentUpdates: boolean; // For both
  promotions: boolean; // Marketing
  emergencyAlerts: boolean; // SOS triggers

  createdAt?: Date;
  updatedAt?: Date;
}

export type NotificationPreferenceModel =
  ISoftDeleteModel<INotificationPreference>;
