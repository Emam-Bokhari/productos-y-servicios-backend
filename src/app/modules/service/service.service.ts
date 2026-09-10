import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { STORE_TYPE } from "../store/store.constant";
import { Store } from "../store/store.model";
import { SERVICE_SEARCHABLE_FIELDS, SERVICE_STATUS } from "./service.constant";
import { IService } from "./service.interface";
import { Service } from "./service.model";
import { validateStoreCreationSubscription } from "../subscription/subscription.utils";
import { Favorite } from "../favorite/favorite.model";
import { FAVORITE_TYPE } from "../../../enums/favorite";

const createServiceToDB = async (
  sellerId: string,
  payload: Partial<IService>,
): Promise<IService> => {
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
      `Your store status is "${store.status}". It must be active to publish services.`,
    );
  }

  // Check active store creation subscription and listing limits
  await validateStoreCreationSubscription(
    sellerId,
    store._id.toString(),
    "service",
  );

  if (store.storeType !== STORE_TYPE.SERVICE_STORE) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Your store is registered as a product store. You can only create products.",
    );
  }

  payload.sellerId = sellerId as any;
  payload.storeId = store._id as any;
  payload.status = SERVICE_STATUS.ACTIVE;

  const result = await Service.create(payload);
  return result;
};

const getMyServicesFromDB = async (
  sellerId: string,
  query: Record<string, unknown>,
) => {
  const serviceQuery = { ...query, sellerId };
  const builder = new QueryBuilder(Service.find(), serviceQuery)
    .search(SERVICE_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const rawData = await builder.modelQuery.populate("storeId");
  const meta = await builder.countTotal();

  let favoriteIdSet = new Set<string>();
  if (sellerId && rawData.length > 0) {
    const serviceIds = rawData.map((s: any) => s._id);
    const userFavorites = await Favorite.find({
      userId: sellerId,
      targetId: { $in: serviceIds },
      targetType: FAVORITE_TYPE.SERVICE,
    }).select("targetId");
    favoriteIdSet = new Set(
      userFavorites.map((f: any) => f.targetId.toString()),
    );
  }

  const data = rawData.map((service: any) => {
    const serviceObj = service.toObject ? service.toObject() : service;
    return {
      ...serviceObj,
      isFavorite: favoriteIdSet.has(service._id.toString()),
    };
  });

  return { data, meta };
};

const getAllServicesFromDB = async (
  query: Record<string, unknown>,
  user?: any,
) => {
  const filterQuery = { status: SERVICE_STATUS.ACTIVE, ...query };
  const builder = new QueryBuilder(Service.find(), filterQuery)
    .search(SERVICE_SEARCHABLE_FIELDS)
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

  let favoriteIdSet = new Set<string>();
  if (user?.id && rawData.length > 0) {
    const serviceIds = rawData.map((s: any) => s._id);
    const userFavorites = await Favorite.find({
      userId: user.id,
      targetId: { $in: serviceIds },
      targetType: FAVORITE_TYPE.SERVICE,
    }).select("targetId");
    favoriteIdSet = new Set(
      userFavorites.map((f: any) => f.targetId.toString()),
    );
  }

  const data = rawData.map((service: any) => {
    const serviceObj = service.toObject ? service.toObject() : service;
    return {
      ...serviceObj,
      isFavorite: user?.id ? favoriteIdSet.has(service._id.toString()) : false,
    };
  });

  return { data, meta };
};

const getSingleServiceFromDB = async (id: string, user?: any) => {
  const result = await Service.findById(id)
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
    throw new ApiError(StatusCodes.NOT_FOUND, "Service not found");
  }

  let isFavorite = false;
  if (user?.id) {
    const existing = await Favorite.exists({
      userId: user.id,
      targetId: result._id,
      targetType: FAVORITE_TYPE.SERVICE,
    });
    isFavorite = !!existing;
  }

  return {
    ...(result.toObject ? result.toObject() : result),
    isFavorite,
  };
};

const updateServiceInDB = async (
  id: string,
  sellerId: string,
  payload: Partial<IService>,
) => {
  const service = await Service.findOne({ _id: id, sellerId });
  if (!service) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Service not found or you do not have permission to edit it",
    );
  }

  const result = await Service.findByIdAndUpdate(id, payload, { new: true });
  return result;
};

const deleteServiceFromDB = async (id: string, sellerId: string) => {
  const service = await Service.findOne({ _id: id, sellerId });
  if (!service) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Service not found or you do not have permission to delete it",
    );
  }

  const result = await Service.findByIdAndDelete(id);
  return result;
};

export const ServiceService = {
  createServiceToDB,
  getMyServicesFromDB,
  getAllServicesFromDB,
  getSingleServiceFromDB,
  updateServiceInDB,
  deleteServiceFromDB,
};
