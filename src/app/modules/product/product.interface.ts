import { Schema } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { PRODUCT_STATUS } from "./product.constant";

export type IProduct = {
  sellerId: Schema.Types.ObjectId;
  storeId: Schema.Types.ObjectId;
  title: string;
  activePrice: number;
  originalPrice?: number;
  description: string;
  additionalInformation?: string;
  images: string[];
  status: PRODUCT_STATUS;
  isFavorite?: boolean;
};

export type ProductModel = ISoftDeleteModel<IProduct>;
