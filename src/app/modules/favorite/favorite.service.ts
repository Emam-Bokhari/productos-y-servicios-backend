import { StatusCodes } from "http-status-codes";
import { Model, Types } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { FAVORITE_TYPE } from "../../../enums/favorite";
import QueryBuilder from "../../builder/queryBuilder";
import { Product } from "../product/product.model";
import { Service } from "../service/service.model";
import { Store } from "../store/store.model";
import { Favorite } from "./favorite.model";

const toggleFavoriteInDB = async (
  userId: string,
  payload: { targetId: string; targetType?: string },
) => {
  const { targetId } = payload;
  const rawTargetType = payload.targetType?.toLowerCase()?.trim();

  let resolvedTargetType: FAVORITE_TYPE;

  if (rawTargetType === FAVORITE_TYPE.PRODUCT) {
    const product = await Product.findById(targetId);
    if (!product) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Product not found");
    }
    resolvedTargetType = FAVORITE_TYPE.PRODUCT;
  } else if (rawTargetType === FAVORITE_TYPE.SERVICE) {
    const service = await Service.findById(targetId);
    if (!service) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Service not found");
    }
    resolvedTargetType = FAVORITE_TYPE.SERVICE;
  } else if (
    rawTargetType === FAVORITE_TYPE.PRODUCT_STORE ||
    rawTargetType === FAVORITE_TYPE.SERVICE_STORE ||
    rawTargetType === "store"
  ) {
    const store = await Store.findById(targetId);
    if (!store) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Store not found");
    }
    resolvedTargetType =
      (store.storeType as FAVORITE_TYPE) || FAVORITE_TYPE.PRODUCT_STORE;
  } else {
    // Auto-detect target model if targetType was omitted
    const [product, service, store] = await Promise.all([
      Product.findById(targetId),
      Service.findById(targetId),
      Store.findById(targetId),
    ]);

    if (product) {
      resolvedTargetType = FAVORITE_TYPE.PRODUCT;
    } else if (service) {
      resolvedTargetType = FAVORITE_TYPE.SERVICE;
    } else if (store) {
      resolvedTargetType =
        (store.storeType as FAVORITE_TYPE) || FAVORITE_TYPE.PRODUCT_STORE;
    } else {
      throw new ApiError(StatusCodes.NOT_FOUND, "Target item not found");
    }
  }

  const existingFavorite = await Favorite.findOne({
    userId,
    targetId,
    targetType: resolvedTargetType,
  });

  if (existingFavorite) {
    await Favorite.findByIdAndDelete(existingFavorite._id);
    return {
      isFavorite: false,
      message: `${resolvedTargetType} removed from favorites`,
      favoriteId: existingFavorite._id,
      targetId,
      targetType: resolvedTargetType,
    };
  } else {
    const result = await Favorite.create({
      userId,
      targetId,
      targetType: resolvedTargetType,
    });

    return {
      isFavorite: true,
      message: `${resolvedTargetType} added to favorites`,
      favoriteId: result._id,
      targetId,
      targetType: resolvedTargetType,
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

  const formattedData = data.map((fav: any) => {
    const favObj = fav.toObject ? fav.toObject() : fav;
    if (favObj.targetId && typeof favObj.targetId === "object") {
      favObj.targetId.isFavorite = true;
    }
    return {
      ...favObj,
      isFavorite: true,
    };
  });

  return { data: formattedData, meta };
};

const checkIsFavoritedFromDB = async (
  userId: string,
  targetId: string,
  targetType?: string,
) => {
  const query: any = { userId, targetId };

  if (targetType) {
    const cleaned = targetType.toLowerCase().trim();
    if (cleaned === "store") {
      query.targetType = {
        $in: [FAVORITE_TYPE.PRODUCT_STORE, FAVORITE_TYPE.SERVICE_STORE],
      };
    } else if (Object.values(FAVORITE_TYPE).includes(cleaned as any)) {
      query.targetType = cleaned;
    }
  }

  const existingFavorite = await Favorite.findOne(query);

  return {
    isFavorite: !!existingFavorite,
    favoriteId: existingFavorite ? existingFavorite._id : null,
    targetId,
    targetType: existingFavorite
      ? existingFavorite.targetType
      : targetType || null,
  };
};

const deleteFavoriteFromDB = async (userId: string, id: string) => {
  const orConditions: any[] = [];
  if (Types.ObjectId.isValid(id)) {
    orConditions.push({ _id: id });
    orConditions.push({ targetId: id });
  } else {
    orConditions.push({ targetId: id });
  }

  const favorite = await Favorite.findOne({
    userId,
    $or: orConditions,
  });

  if (!favorite) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Favorite item not found");
  }

  await Favorite.findByIdAndDelete(favorite._id);
  return {
    isFavorite: false,
    favoriteId: favorite._id,
    targetId: favorite.targetId,
    targetType: favorite.targetType,
  };
};

export const FavoriteService = {
  toggleFavoriteInDB,
  getMyFavoritesFromDB,
  checkIsFavoritedFromDB,
  deleteFavoriteFromDB,
};
