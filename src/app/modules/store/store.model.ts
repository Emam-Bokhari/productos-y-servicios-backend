import { model, Schema } from "mongoose";
import { IStore, StoreModel } from "./store.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { STORE_STATUS, STORE_TYPE, DOCUMENT_TYPE } from "./store.constant";
import { DAYS } from "../../../constants/days";

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
    subCategoryId: {
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
    country: {
      type: String,
      required: false,
      trim: true,
    },
    province: {
      type: String,
      required: false,
      trim: true,
    },
    city: {
      type: String,
      required: false,
      trim: true,
    },
    canton: {
      type: String,
      required: false,
      trim: true,
    },
    sector: {
      type: String,
      required: false,
      trim: true,
    },
    neighborhood: {
      type: String,
      required: false,
      trim: true,
    },
    cityId: {
      type: Schema.Types.ObjectId,
      ref: "CityAdConfiguration",
      required: true,
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
    documentType: {
      type: String,
      enum: Object.values(DOCUMENT_TYPE),
      required: false,
    },
    documentNumber: {
      type: String,
      required: false,
      trim: true,
    },
    documentFront: {
      type: String,
      required: false,
    },
    documentBack: {
      type: String,
      required: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    visitorCount: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
    workingDays: {
      type: [String],
      enum: Object.values(DAYS),
      required: false,
    },
    openingTime: {
      type: String,
      required: false,
    },
    closingTime: {
      type: String,
      required: false,
    },
    isOpen24Hours: {
      type: Boolean,
      default: false,
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
storeSchema.index({ storeType: 1 });
storeSchema.index({ status: 1 });
storeSchema.index({ categoryId: 1 });
storeSchema.index({ subCategoryId: 1 });
storeSchema.index({ cityId: 1 });
storeSchema.index({ country: 1 });
storeSchema.index({ province: 1 });
storeSchema.index({ city: 1 });
storeSchema.index({ sector: 1 });
storeSchema.index({ neighborhood: 1 });

export const Store = model<IStore, StoreModel>("Store", storeSchema);
