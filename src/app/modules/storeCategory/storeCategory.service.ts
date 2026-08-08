import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { IStoreCategory } from "./storeCategory.interface";
import { StoreCategory } from "./storeCategory.model";

const createCategoryToDB = async (payload: IStoreCategory) => {
  const isExist = await StoreCategory.findOne({ name: payload.name });
  if (isExist) {
    throw new ApiError(StatusCodes.CONFLICT, "Category already exists");
  }

  const category = await StoreCategory.create(payload);
  if (!category) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to create category");
  }
  return category;
};

const getAllCategoriesFromDB = async (query: Record<string, any>) => {
  const { type, status } = query;
  const filter: Record<string, any> = {};

  if (type) {
    filter.type = type;
  }
  if (status) {
    filter.status = status;
  }

  const categories = await StoreCategory.find(filter);
  return categories;
};

const getCategoryByIdFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  const category = await StoreCategory.findById(id);
  if (!category) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Category not found");
  }
  return category;
};

const updateCategoryInDB = async (id: string, payload: Partial<IStoreCategory>) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  if (payload.name) {
    const isExist = await StoreCategory.findOne({
      name: payload.name,
      _id: { $ne: id },
    });
    if (isExist) {
      throw new ApiError(StatusCodes.CONFLICT, "Category name already exists");
    }
  }

  const category = await StoreCategory.findByIdAndUpdate(
    { _id: id },
    payload,
    { new: true }
  );

  if (!category) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Category not found to update");
  }
  return category;
};

const deleteCategoryFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  const category = await StoreCategory.softDeleteById(id);
  if (!category) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Category not found or already deleted");
  }
  return category;
};

export const StoreCategoryService = {
  createCategoryToDB,
  getAllCategoriesFromDB,
  getCategoryByIdFromDB,
  updateCategoryInDB,
  deleteCategoryFromDB,
};
