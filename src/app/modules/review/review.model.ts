import { model, Schema } from "mongoose";
import { IReview, ReviewModel, IReply } from "./review.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const replySchema = new Schema<IReply>(
  {
    comment: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const reviewSchema = new Schema<IReview>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
    },
    ownerReply: {
      type: replySchema,
      required: false,
    },
    userReply: {
      type: replySchema,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Apply soft delete plugin
reviewSchema.plugin(softDeletePlugin);

// Create compound unique index to allow only one review per user per store
reviewSchema.index({ storeId: 1, userId: 1 }, { unique: true });

// Define virtual for isReplied
reviewSchema.virtual("isReplied").get(function (this: any) {
  return !!this.ownerReply;
});

// Enable virtuals in serialization
reviewSchema.set("toJSON", { virtuals: true });
reviewSchema.set("toObject", { virtuals: true });

export const Review = model<IReview, ReviewModel>("Review", reviewSchema);
