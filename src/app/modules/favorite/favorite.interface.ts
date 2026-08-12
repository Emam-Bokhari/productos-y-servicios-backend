import { Types } from "mongoose";
import { FAVORITE_TYPE } from "../../../enums/favorite";
import { ISoftDeleteModel } from "../../../types/softDelete";

export type IFavorite = {
  userId: Types.ObjectId;
  targetId: Types.ObjectId;
  targetType: FAVORITE_TYPE;
  isDeleted?: boolean;
};

export type FavoriteModel = ISoftDeleteModel<IFavorite>;
