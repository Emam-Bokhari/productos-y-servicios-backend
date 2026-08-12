import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { SERVICE_STATUS } from "./service.constant";
import { IService, ServiceModel } from "./service.interface";

const serviceSchema = new Schema<IService>(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    activePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    originalPrice: {
      type: Number,
      required: false,
      min: 0,
    },
    description: {
      type: String,
      required: true,
    },
    whatsIncluded: {
      type: [String],
      default: [],
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(SERVICE_STATUS),
      default: SERVICE_STATUS.ACTIVE,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

serviceSchema.plugin(softDeletePlugin);

serviceSchema.index({ sellerId: 1, createdAt: -1 });
serviceSchema.index({ storeId: 1, createdAt: -1 });

export const Service = model<IService, ServiceModel>("Service", serviceSchema);
