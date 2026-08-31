import { Schema } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";

export type IReply = {
  comment: string;
  createdAt: Date;
};

export type IReview = {
  storeId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  rating: number;
  comment: string;
  ownerReply?: IReply;
  userReply?: IReply;
  isReplied?: boolean;
};

export type ReviewModel = ISoftDeleteModel<IReview>;
