import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { model, Schema } from "mongoose";
import { IBroadcast, BroadcastModel } from "./broadcast.interface";
import {
  BROADCAST_AUDIENCE,
  BROADCAST_CHANNEL,
  BROADCAST_STATUS,
} from "./broadcast.constant";

const broadcastSchema = new Schema<IBroadcast, BroadcastModel>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    audience: {
      type: String,
      enum: Object.values(BROADCAST_AUDIENCE),
      required: true,
    },
    channel: {
      type: String,
      enum: Object.values(BROADCAST_CHANNEL),
      default: BROADCAST_CHANNEL.PUSH_NOTIFICATION,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(BROADCAST_STATUS),
      default: BROADCAST_STATUS.PENDING,
      index: true,
    },
    sentAt: {
      type: Date,
      required: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
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

broadcastSchema.index({ status: 1, createdAt: -1 });

broadcastSchema.plugin(softDeletePlugin);

export const Broadcast = model<IBroadcast, BroadcastModel>(
  "Broadcast",
  broadcastSchema,
);
