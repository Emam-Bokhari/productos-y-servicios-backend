import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { TSubscriptionPackage } from "./subscriptionPackage.interface";
import { SubscriptionPackage } from "./subscriptionPackage.model";
import { SUBSCRIPTION_PACKAGE_STATUS } from "./subscriptionPackage.constant";

const createSubscriptionPackageInDB = async (payload: TSubscriptionPackage) => {
  const status = payload.status || SUBSCRIPTION_PACKAGE_STATUS.ACTIVE;

  // Save to database
  const subscriptionPackage = await SubscriptionPackage.create({
    ...payload,
    status,
  });

  if (!subscriptionPackage) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to create subscription package",
    );
  }

  return subscriptionPackage;
};

const subscriptionPackagesFromDB = async (query: Record<string, any>) => {
  const filter: Record<string, any> = {};
  if (query.status) {
    filter.status = query.status;
  }
  if (query.packageType) {
    filter.packageType = query.packageType;
  }
  const packages = await SubscriptionPackage.find(filter);
  return packages;
};

const subscriptionPackageByIdFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const pkg = await SubscriptionPackage.findById(id);
  if (!pkg) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  return pkg;
};

const updateSubscriptionPackageInDB = async (
  id: string,
  payload: Partial<TSubscriptionPackage>,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const existingPackage = await SubscriptionPackage.findById(id);
  if (!existingPackage) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  const updatedPackage = await SubscriptionPackage.findByIdAndUpdate(
    id,
    payload,
    { new: true },
  );

  if (!updatedPackage) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to update subscription package",
    );
  }

  return updatedPackage;
};

const deleteSubscriptionPackageFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const existingPackage = await SubscriptionPackage.findById(id);
  if (!existingPackage) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  // Soft delete from database
  const result = await SubscriptionPackage.softDeleteById(id);
  if (!result) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to delete subscription package",
    );
  }

  return result;
};

const updateSubscriptionPackageStatusInDB = async (
  id: string,
  status: SUBSCRIPTION_PACKAGE_STATUS,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const existingPackage = await SubscriptionPackage.findById(id);
  if (!existingPackage) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  const updatedPackage = await SubscriptionPackage.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  );

  if (!updatedPackage) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update status");
  }

  return updatedPackage;
};

export const SubscriptionPackageService = {
  createSubscriptionPackageInDB,
  subscriptionPackagesFromDB,
  subscriptionPackageByIdFromDB,
  updateSubscriptionPackageInDB,
  deleteSubscriptionPackageFromDB,
  updateSubscriptionPackageStatusInDB,
};
