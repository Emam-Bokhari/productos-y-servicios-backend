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
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "StoreCategory",
      default: null,
      index: true,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for child subcategories
storeCategorySchema.virtual("subCategories", {
  ref: "StoreCategory",
  localField: "_id",
  foreignField: "parentId",
});

// Virtual for parent category
storeCategorySchema.virtual("parent", {
  ref: "StoreCategory",
  localField: "parentId",
  foreignField: "_id",
  justOne: true,
});

// Compound index for unique category/subcategory name under the same parent, type, and active status
storeCategorySchema.index({ name: 1, parentId: 1, type: 1, isDeleted: 1 });

// Apply soft delete plugin
storeCategorySchema.plugin(softDeletePlugin);

export const StoreCategory = model<IStoreCategory, StoreCategoryModel>(
  "StoreCategory",
  storeCategorySchema,
);
