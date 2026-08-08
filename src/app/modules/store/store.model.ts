import { model, Schema } from "mongoose";
import { IStore, StoreModel } from "./store.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { STORE_STATUS, STORE_TYPE } from "./store.constant";

const storeSchema = new Schema<IStore>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    storeType: {
      type: String,
      enum: Object.values(STORE_TYPE),
      required: false,
    },
    displayName: {
      type: String,
      required: false,
      trim: true,
    },
    description: {
      type: String,
      required: false,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "StoreCategory",
      required: false,
    },
    logo: {
      type: String,
      required: false,
    },
    coverImage: {
      type: String,
      required: false,
    },
    phone: {
      type: String,
      required: false,
      trim: true,
    },
    whatsapp: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: false,
      trim: true,
    },
    streetAddress: {
      type: String,
      required: false,
    },
    city: {
      type: String,
      required: false,
    },
    postalCode: {
      type: String,
      required: false,
    },
    latitude: {
      type: Number,
      required: false,
    },
    longitude: {
      type: Number,
      required: false,
    },
    businessLicenseNumber: {
      type: String,
      required: false,
      trim: true,
    },
    tradeLicense: {
      type: String,
      required: false,
    },
    tinNumber: {
      type: String,
      required: false,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(STORE_STATUS),
      default: STORE_STATUS.UNDER_REVIEW,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Apply soft delete plugin
storeSchema.plugin(softDeletePlugin);

// Create indexes
storeSchema.index({ owner: 1 });
storeSchema.index({ displayName: 1 }, { sparse: true });
storeSchema.index({ phone: 1 }, { sparse: true });
storeSchema.index({ businessLicenseNumber: 1 }, { sparse: true });

export const Store = model<IStore, StoreModel>("Store", storeSchema);
