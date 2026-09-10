import { Schema } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { SERVICE_STATUS } from "./service.constant";

export type IService = {
  sellerId: Schema.Types.ObjectId;
  storeId: Schema.Types.ObjectId;
  title: string;
  activePrice: number;
  originalPrice?: number;
  description: string;
  whatsIncluded?: string[];
  images: string[];
  status: SERVICE_STATUS;
  isFavorite?: boolean;
};

export type ServiceModel = ISoftDeleteModel<IService>;
