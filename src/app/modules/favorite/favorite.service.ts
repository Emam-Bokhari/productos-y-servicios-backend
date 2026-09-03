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
  [FAVORITE_TYPE.PRODUCT_STORE]: Store,
  [FAVORITE_TYPE.SERVICE_STORE]: Store,
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

  // Verify storeType matches the targetType if the target is a store
  if (
    targetType === FAVORITE_TYPE.PRODUCT_STORE ||
    targetType === FAVORITE_TYPE.SERVICE_STORE
  ) {
    if ((targetExists as any).storeType !== targetType) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Store type does not match. Expected ${targetType} but found ${(targetExists as any).storeType || "none"}`,
      );
    }
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
  const filterQuery: Record<string, any> = { userId };

  // Parse types from various potential query formats
  const targetTypes = new Set<string>();

  // 1. Check direct query parameters for type/targetType
  const typeParam = query.targetType || query.type;
  if (typeParam) {
    const rawTypes = Array.isArray(typeParam)
      ? typeParam
      : typeof typeParam === "string"
        ? typeParam.split(",")
        : [];

    rawTypes.forEach((t) => {
      if (typeof t === "string") {
        const cleaned = t.trim().toLowerCase();
        if (cleaned === "store") {
          targetTypes.add(FAVORITE_TYPE.PRODUCT_STORE);
          targetTypes.add(FAVORITE_TYPE.SERVICE_STORE);
        } else if (
          Object.values(FAVORITE_TYPE).includes(cleaned as FAVORITE_TYPE)
        ) {
          targetTypes.add(cleaned);
        }
      }
    });
  }

  // 2. Check individual boolean parameters like ?store=true, ?product=true, ?service=true, etc.
  const allPossibleTypes = [...Object.values(FAVORITE_TYPE), "store"];
  allPossibleTypes.forEach((favType) => {
    if (
      query[favType] !== undefined &&
      (query[favType] === "true" ||
        query[favType] === true ||
        query[favType] === "1" ||
        query[favType] === "")
    ) {
      if (favType === "store") {
        targetTypes.add(FAVORITE_TYPE.PRODUCT_STORE);
        targetTypes.add(FAVORITE_TYPE.SERVICE_STORE);
      } else {
        targetTypes.add(favType);
      }
    }
  });

  // Apply targetType filter if specified
  if (targetTypes.size > 0) {
    filterQuery.targetType = { $in: Array.from(targetTypes) };
  }

  // Clean the query to avoid passing raw type/targetType/store/product/service etc. to QueryBuilder
  const cleanQuery = { ...query };
  delete cleanQuery.type;
  delete cleanQuery.targetType;
  allPossibleTypes.forEach((favType) => {
    delete cleanQuery[favType];
  });

  const builder = new QueryBuilder(Favorite.find(), {
    ...filterQuery,
    ...cleanQuery,
  })
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery.populate({
    path: "targetId",
    strictPopulate: false,
    populate: [
      {
        path: "categoryId",
        strictPopulate: false,
      },
      {
        path: "cityId",
        strictPopulate: false,
      },
      {
        path: "storeId",
        strictPopulate: false,
        populate: [
          {
            path: "categoryId",
            strictPopulate: false,
          },
          {
            path: "cityId",
            strictPopulate: false,
          },
        ],
      },
    ],
  });
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
