import { model, Schema } from "mongoose";
import { IStoreCategory, StoreCategoryModel } from "./storeCategory.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { STATUS } from "../../../constants/status";
import { CATEGORY_TYPE } from "./storeCategory.constant";

const storeCategorySchema = new Schema<IStoreCategory>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      enum: Object.values(CATEGORY_TYPE),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.ACTIVE,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Apply soft delete plugin
storeCategorySchema.plugin(softDeletePlugin);

export const StoreCategory = model<IStoreCategory, StoreCategoryModel>(
  "StoreCategory",
  storeCategorySchema,
);
