import { Model } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";

export type TBanner = {
  name: string;
  description: string;
  image: string;
  status: "active" | "inactive";
};

export type BannerModel = ISoftDeleteModel<TBanner>;
