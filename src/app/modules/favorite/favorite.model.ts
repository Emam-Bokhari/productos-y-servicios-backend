import { model, Schema } from "mongoose";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { FAVORITE_TYPE } from "../../../enums/favorite";
import { FavoriteModel, IFavorite } from "./favorite.interface";

const favoriteSchema = new Schema<IFavorite>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      refPath: "targetModel",
      required: true,
    },
    targetType: {
      type: String,
      enum: Object.values(FAVORITE_TYPE),
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual property mapping lowercase enum value to registered Mongoose model name
favoriteSchema.virtual("targetModel").get(function () {
  const modelNameMap: Record<string, string> = {
    [FAVORITE_TYPE.PRODUCT_STORE]: "Store",
    [FAVORITE_TYPE.SERVICE_STORE]: "Store",
    [FAVORITE_TYPE.PRODUCT]: "Product",
    [FAVORITE_TYPE.SERVICE]: "Service",
  };
  return modelNameMap[this.targetType];
});

// Apply soft delete plugin
favoriteSchema.plugin(softDeletePlugin);

// Unique compound index so a user can favorite each target only once
favoriteSchema.index(
  { userId: 1, targetId: 1, targetType: 1 },
  { unique: true },
);
favoriteSchema.index({ userId: 1, targetType: 1, createdAt: -1 });

export const Favorite = model<IFavorite, FavoriteModel>(
  "Favorite",
  favoriteSchema,
);
