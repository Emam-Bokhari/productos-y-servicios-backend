import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import {
  ADVERTISEMENT_STATUS,
  ADVERTISEMENT_TYPE,
} from "./advertisement.constant";
import { AdvertisementModel, IAdvertisement } from "./advertisement.interface";

const advertisementSchema = new Schema<IAdvertisement>(
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
    advertisementType: {
      type: String,
      enum: Object.values(ADVERTISEMENT_TYPE),
      required: true,
    },
    campaignName: {
      type: String,
      required: true,
      trim: true,
    },
    cityAdConfigId: {
      type: Schema.Types.ObjectId,
      ref: "CityAdConfiguration",
      required: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    countryCode: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    featuredImage: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: Object.values(ADVERTISEMENT_STATUS),
      default: ADVERTISEMENT_STATUS.ACTIVE,
    },
    price: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

advertisementSchema.plugin(softDeletePlugin);

// Create indexes to optimize listings and slot availability computations
advertisementSchema.index({ sellerId: 1, createdAt: -1 });
advertisementSchema.index({
  cityAdConfigId: 1,
  advertisementType: 1,
  status: 1,
  startDate: 1,
  endDate: 1,
});

export const Advertisement = model<IAdvertisement, AdvertisementModel>(
  "Advertisement",
  advertisementSchema,
);
