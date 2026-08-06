import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { model, Schema } from "mongoose";
import { INotification, NotificationModel } from "./notification.interface";
import { NOTIFICATION_TYPE } from "./notification.constant";

const notificationSchema = new Schema<INotification, NotificationModel>(
  {
    title: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      refPath: "referenceModel",
      required: false,
    },
    referenceModel: {
      type: String,
      required: false,
      enum: ["Car", "Review", "User", "Ride", "Wallet"],
    },
    read: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPE),
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

notificationSchema.plugin(softDeletePlugin);

export const Notification = model<INotification, NotificationModel>(
  "Notification",
  notificationSchema,
);
