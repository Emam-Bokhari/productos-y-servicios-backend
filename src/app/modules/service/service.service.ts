import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { STORE_TYPE } from "../store/store.constant";
import { Store } from "../store/store.model";
import { SERVICE_SEARCHABLE_FIELDS, SERVICE_STATUS } from "./service.constant";
import { IService } from "./service.interface";
import { Service } from "./service.model";
import { validateStoreCreationSubscription } from "../subscription/subscription.utils";

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
  await validateStoreCreationSubscription(sellerId, store._id.toString(), "service");

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

  const data = await builder.modelQuery.populate("storeId");
  const meta = await builder.countTotal();

  return { data, meta };
};

const getAllServicesFromDB = async (query: Record<string, unknown>) => {
  const filterQuery = { status: SERVICE_STATUS.ACTIVE, ...query };
  const builder = new QueryBuilder(Service.find(), filterQuery)
    .search(SERVICE_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery.populate(
    "storeId",
    "displayName logo city rating",
  );
  const meta = await builder.countTotal();

  return { data, meta };
};

const getSingleServiceFromDB = async (id: string) => {
  const result = await Service.findById(id)
    .populate("storeId")
    .populate("sellerId", "name email image");
  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Service not found");
  }
  return result;
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
