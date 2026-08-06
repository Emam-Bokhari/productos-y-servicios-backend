import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { model, Schema } from "mongoose";
import { IBroadcast, BroadcastModel } from "./broadcast.interface";
import {
  BROADCAST_DELIVERY_TYPE,
  BROADCAST_STATUS,
  BROADCAST_TARGET,
  BROADCAST_TYPE,
} from "./broadcast.constant";

const broadcastSchema = new Schema<IBroadcast, BroadcastModel>(
  {
    deliveryType: {
      type: String,
      enum: Object.values(BROADCAST_DELIVERY_TYPE),
      required: true,
    },
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
    type: {
      type: String,
      enum: Object.values(BROADCAST_TYPE),
      required: true,
    },
    targetAudience: {
      type: String,
      enum: Object.values(BROADCAST_TARGET),
      required: true,
    },
    targetFilters: {
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      tier: {
        type: String,
        trim: true,
      },
      userIds: {
        type: [Schema.Types.ObjectId],
        ref: "User",
        default: [],
      },
    },
    scheduledAt: {
      type: Date,
      required: false,
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

// Indexes to speed up retrieving scheduled messages and active broadcasts
broadcastSchema.index({ status: 1, scheduledAt: 1 });

broadcastSchema.plugin(softDeletePlugin);

export const Broadcast = model<IBroadcast, BroadcastModel>(
  "Broadcast",
  broadcastSchema,
);
