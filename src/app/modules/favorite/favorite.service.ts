import { StatusCodes } from "http-status-codes";
import { Model } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { FAVORITE_TYPE } from "../../../enums/favorite";
import QueryBuilder from "../../builder/queryBuilder";
import { Product } from "../product/product.model";
import { Service } from "../service/service.model";
import { Store } from "../store/store.model";
import { Favorite } from "./favorite.model";

const targetModelMap: Record<FAVORITE_TYPE, Model<any>> = {
  [FAVORITE_TYPE.STORE]: Store,
  [FAVORITE_TYPE.PRODUCT]: Product,
  [FAVORITE_TYPE.SERVICE]: Service,
};

const toggleFavoriteInDB = async (
  userId: string,
  payload: { targetId: string; targetType: FAVORITE_TYPE },
) => {
  const { targetId, targetType } = payload;

  const TargetModel = targetModelMap[targetType];
  if (!TargetModel) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid target type");
  }

  const targetExists = await TargetModel.findById(targetId);
  if (!targetExists) {
    throw new ApiError(StatusCodes.NOT_FOUND, `${targetType} not found`);
  }

  const existingFavorite = await Favorite.findOne({
    userId,
    targetId,
    targetType,
  });

  if (existingFavorite) {
    await Favorite.findByIdAndDelete(existingFavorite._id);
    return {
      isFavorited: false,
      message: `${targetType} removed from favorites`,
      favoriteId: existingFavorite._id,
    };
  } else {
    const result = await Favorite.create({
      userId,
      targetId,
      targetType,
    });

    return {
      isFavorited: true,
      message: `${targetType} added to favorites`,
      data: result,
    };
  }
};

const getMyFavoritesFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const filterQuery = { userId, ...query };
  const builder = new QueryBuilder(Favorite.find(), filterQuery)
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery.populate("targetId");
  const meta = await builder.countTotal();

  return { data, meta };
};

const checkIsFavoritedFromDB = async (
  userId: string,
  targetId: string,
  targetType: FAVORITE_TYPE,
) => {
  const existingFavorite = await Favorite.findOne({
    userId,
    targetId,
    targetType,
  });

  return {
    isFavorited: !!existingFavorite,
    favoriteId: existingFavorite ? existingFavorite._id : null,
  };
};

const deleteFavoriteFromDB = async (userId: string, favoriteId: string) => {
  const favorite = await Favorite.findOne({ _id: favoriteId, userId });
  if (!favorite) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Favorite item not found");
  }

  const result = await Favorite.findByIdAndDelete(favoriteId);
  return result;
};

export const FavoriteService = {
  toggleFavoriteInDB,
  getMyFavoritesFromDB,
  checkIsFavoritedFromDB,
  deleteFavoriteFromDB,
};
