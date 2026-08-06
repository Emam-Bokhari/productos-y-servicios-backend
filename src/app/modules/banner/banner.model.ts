import { model, Schema } from "mongoose";
import { TBanner, BannerModel } from "./banner.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const bannerSchema = new Schema<TBanner>(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bannerSchema.plugin(softDeletePlugin);

export const Banner = model<TBanner, BannerModel>("Banner", bannerSchema);
