import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { SLOT_CONFIG_STATUS } from "./cityAdConfiguration.constant";
import {
  CityAdConfigurationModel,
  ICityAdConfiguration,
} from "./cityAdConfiguration.interface";

const cityAdConfigurationSchema = new Schema<ICityAdConfiguration>(
  {
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
    featuredCapacity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    featuredEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    status: {
      type: String,
      enum: Object.values(SLOT_CONFIG_STATUS),
      default: SLOT_CONFIG_STATUS.ACTIVE,
    },
    lockVersion: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

cityAdConfigurationSchema.plugin(softDeletePlugin);

// Compound unique index to prevent duplicate city configurations
cityAdConfigurationSchema.index({ country: 1, city: 1 }, { unique: true });
cityAdConfigurationSchema.index({ latitude: 1, longitude: 1 });

export const CityAdConfiguration = model<
  ICityAdConfiguration,
  CityAdConfigurationModel
>("CityAdConfiguration", cityAdConfigurationSchema);
