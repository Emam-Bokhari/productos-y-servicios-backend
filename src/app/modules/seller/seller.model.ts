import { model, Schema } from "mongoose";
import { ISeller, SellerModel } from "./seller.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { STATUS } from "../../../constants/status";

const sellerSchema = new Schema<ISeller>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    store: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      unique: true,
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
sellerSchema.plugin(softDeletePlugin);

export const Seller = model<ISeller, SellerModel>("Seller", sellerSchema);
