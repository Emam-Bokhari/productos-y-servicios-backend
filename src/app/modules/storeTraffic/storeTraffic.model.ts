import { Schema, model } from "mongoose";
import { IStoreTraffic } from "./storeTraffic.interface";

const storeTrafficSchema = new Schema<IStoreTraffic>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound index on storeId and date for unique constraints
storeTrafficSchema.index({ storeId: 1, date: 1 }, { unique: true });

export const StoreTraffic = model<IStoreTraffic>("StoreTraffic", storeTrafficSchema);
