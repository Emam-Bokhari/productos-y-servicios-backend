import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { STORE_TYPE } from "../store/store.constant";
import { Store } from "../store/store.model";
import { PRODUCT_SEARCHABLE_FIELDS, PRODUCT_STATUS } from "./product.constant";
import { IProduct } from "./product.interface";
import { Product } from "./product.model";
import { validateStoreCreationSubscription } from "../subscription/subscription.utils";
import { Favorite } from "../favorite/favorite.model";
import { FAVORITE_TYPE } from "../../../enums/favorite";

const createProductToDB = async (
  sellerId: string,
  payload: Partial<IProduct>,
): Promise<IProduct> => {
  const store = await Store.findOne({ owner: sellerId });
  if (!store) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Store profile not found. Please create a store first.",
    );
  }

  if (store.status !== "active") {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      `Your store status is "${store.status}". It must be active to publish products.`,
    );
  }

  // Check active store creation subscription and listing limits
  await validateStoreCreationSubscription(
    sellerId,
    store._id.toString(),
    "product",
  );

  if (store.storeType !== STORE_TYPE.PRODUCT_STORE) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Your store is registered as a service store. You can only create services.",
    );
  }

  payload.sellerId = sellerId as any;
  payload.storeId = store._id as any;
  payload.status = PRODUCT_STATUS.ACTIVE;

  const result = await Product.create(payload);
  return result;
};

const getMyProductsFromDB = async (
  sellerId: string,
  query: Record<string, unknown>,
) => {
  const productQuery = { ...query, sellerId };
  const builder = new QueryBuilder(Product.find(), productQuery)
    .search(PRODUCT_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const rawData = await builder.modelQuery.populate("storeId");
  const meta = await builder.countTotal();

  let favoriteIdSet = new Set<string>();
  if (sellerId && rawData.length > 0) {
    const productIds = rawData.map((p: any) => p._id);
    const userFavorites = await Favorite.find({
      userId: sellerId,
      targetId: { $in: productIds },
      targetType: FAVORITE_TYPE.PRODUCT,
    }).select("targetId");
    favoriteIdSet = new Set(
      userFavorites.map((f: any) => f.targetId.toString()),
    );
  }

  const data = rawData.map((product: any) => {
    const productObj = product.toObject ? product.toObject() : product;
    const isFav = favoriteIdSet.has(product._id.toString());
    return {
      ...productObj,
      isFavorite: isFav,
    };
  });

  return { data, meta };
};

const getAllProductsFromDB = async (
  query: Record<string, unknown>,
  user?: any,
) => {
  const filterQuery = { status: PRODUCT_STATUS.ACTIVE, ...query };
  const builder = new QueryBuilder(Product.find(), filterQuery)
    .search(PRODUCT_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const rawData = await builder.modelQuery.populate({
    path: "storeId",
    select: "displayName logo cityId averageRating",
    populate: {
      path: "cityId",
      select: "city country countryCode",
    },
  });
  const meta = await builder.countTotal();

  const currentUserId = user?.id || user?._id;
  let favoriteIdSet = new Set<string>();
  if (currentUserId && rawData.length > 0) {
    const productIds = rawData.map((p: any) => p._id);
    const userFavorites = await Favorite.find({
      userId: currentUserId,
      targetId: { $in: productIds },
      targetType: FAVORITE_TYPE.PRODUCT,
    }).select("targetId");
    favoriteIdSet = new Set(
      userFavorites.map((f: any) => f.targetId.toString()),
    );
  }

  const data = rawData.map((product: any) => {
    const productObj = product.toObject ? product.toObject() : product;
    const isFav = currentUserId
      ? favoriteIdSet.has(product._id.toString())
      : false;
    return {
      ...productObj,
      isFavorite: isFav,
    };
  });

  return { data, meta };
};

const getSingleProductFromDB = async (id: string, user?: any) => {
  const result = await Product.findById(id)
    .populate({
      path: "storeId",
      populate: [
        {
          path: "categoryId",
        },
        {
          path: "cityId",
        },
      ],
    })
    .populate("sellerId", "name email image");
  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Product not found");
  }

  const currentUserId = user?.id || user?._id;
  let isFavorite = false;
  if (currentUserId) {
    const existing = await Favorite.exists({
      userId: currentUserId,
      targetId: result._id,
      targetType: FAVORITE_TYPE.PRODUCT,
    });
    isFavorite = !!existing;
  }

  return {
    ...(result.toObject ? result.toObject() : result),
    isFavorite,
  };
};

const updateProductInDB = async (
  id: string,
  sellerId: string,
  payload: Partial<IProduct>,
) => {
  const product = await Product.findOne({ _id: id, sellerId });
  if (!product) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Product not found or you do not have permission to edit it",
    );
  }

  const result = await Product.findByIdAndUpdate(id, payload, { new: true });
  return result;
};

const deleteProductFromDB = async (id: string, sellerId: string) => {
  const product = await Product.findOne({ _id: id, sellerId });
  if (!product) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Product not found or you do not have permission to delete it",
    );
  }

  const result = await Product.findByIdAndDelete(id);
  return result;
};

export const ProductService = {
  createProductToDB,
  getMyProductsFromDB,
  getAllProductsFromDB,
  getSingleProductFromDB,
  updateProductInDB,
  deleteProductFromDB,
};