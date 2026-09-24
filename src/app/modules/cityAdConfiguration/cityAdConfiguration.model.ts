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
    province: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    canton: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    sector: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    neighborhood: {
      type: String,
      required: false,
      default: "",
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
    featuredPositionPricing: [
      {
        position: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        _id: false,
      },
    ],
    defaultFeaturedImage: {
      type: String,
      default: "",
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

// Sync city and canton if either is missing
cityAdConfigurationSchema.pre("save", function (next) {
  if (this.city && !this.canton) {
    this.canton = this.city;
  } else if (this.canton && !this.city) {
    this.city = this.canton;
  }
  next();
});

// Compound unique index for location hierarchy: COUNTRY > PROVINCE > CITY/CANTON > SECTOR > NEIGHBORHOOD
cityAdConfigurationSchema.index(
  {
    country: 1,
    province: 1,
    city: 1,
    sector: 1,
    neighborhood: 1,
  },
  { unique: true },
);
cityAdConfigurationSchema.index({ country: 1, province: 1, city: 1 });
cityAdConfigurationSchema.index({ province: 1 });
cityAdConfigurationSchema.index({ city: 1 });
cityAdConfigurationSchema.index({ sector: 1 });
cityAdConfigurationSchema.index({ neighborhood: 1 });
cityAdConfigurationSchema.index({ latitude: 1, longitude: 1 });
cityAdConfigurationSchema.index({ status: 1 });

export const CityAdConfiguration = model<
  ICityAdConfiguration,
  CityAdConfigurationModel
>("CityAdConfiguration", cityAdConfigurationSchema);

// Safe cleanup of legacy unique index if it exists in DB
CityAdConfiguration.collection.dropIndex("country_1_city_1").catch(() => {
  // Legacy index does not exist, ignore
});
