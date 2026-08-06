import { model, Schema } from "mongoose";
import {
  INotificationPreference,
  NotificationPreferenceModel,
} from "./notificationPreference.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const notificationPreferenceSchema = new Schema<
  INotificationPreference,
  NotificationPreferenceModel
>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: Boolean,
      default: true,
    },
    push: {
      type: Boolean,
      default: true,
    },
    // sms: {
    //   type: Boolean,
    //   default: true,
    // },
    newRideRequests: {
      type: Boolean,
      default: true,
    },
    rideUpdates: {
      type: Boolean,
      default: true,
    },
    chatMessages: {
      type: Boolean,
      default: true,
    },
    paymentUpdates: {
      type: Boolean,
      default: true,
    },
    promotions: {
      type: Boolean,
      default: true,
    },
    emergencyAlerts: {
      type: Boolean,
      default: true,
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

notificationPreferenceSchema.plugin(softDeletePlugin);

export const NotificationPreference = model<
  INotificationPreference,
  NotificationPreferenceModel
>("NotificationPreference", notificationPreferenceSchema);
