import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { PRODUCT_STATUS } from "./product.constant";
import { IProduct, ProductModel } from "./product.interface";

const productSchema = new Schema<IProduct>(
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
    title: {
      type: String,
      required: true,
      trim: true,
    },
    activePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    originalPrice: {
      type: Number,
      required: false,
      min: 0,
    },
    description: {
      type: String,
      required: true,
    },
    additionalInformation: {
      type: String,
      required: false,
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(PRODUCT_STATUS),
      default: PRODUCT_STATUS.ACTIVE,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

productSchema.plugin(softDeletePlugin);

productSchema.index({ sellerId: 1, createdAt: -1 });
productSchema.index({ storeId: 1, createdAt: -1 });

export const Product = model<IProduct, ProductModel>("Product", productSchema);
