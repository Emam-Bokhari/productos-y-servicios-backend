import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { IStoreCategory } from "./storeCategory.interface";
import { StoreCategory } from "./storeCategory.model";
import { Store } from "../store/store.model";
import { Product } from "../product/product.model";
import { Service } from "../service/service.model";
import { STORE_STATUS } from "../store/store.constant";
import { PRODUCT_STATUS } from "../product/product.constant";
import { SERVICE_STATUS } from "../service/service.constant";
import { CATEGORY_TYPE } from "./storeCategory.constant";

const getCategoryListingsCount = async (
  categoryId: mongoose.Types.ObjectId | string,
  categoryType: string,
): Promise<number> => {
  const activeStores = await Store.find({
    categoryId,
    status: STORE_STATUS.ACTIVE,
  });

  const storeIds = activeStores.map((store) => store._id);
  if (storeIds.length === 0) {
    return 0;
  }

  if (categoryType === CATEGORY_TYPE.PRODUCT) {
    return await Product.countDocuments({
      storeId: { $in: storeIds },
      status: PRODUCT_STATUS.ACTIVE,
    });
  } else if (categoryType === CATEGORY_TYPE.SERVICE) {
    return await Service.countDocuments({
      storeId: { $in: storeIds },
      status: SERVICE_STATUS.ACTIVE,
    });
  }

  return 0;
};

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
  
  const categoriesWithCount = await Promise.all(
    categories.map(async (category) => {
      const listingsCount = await getCategoryListingsCount(
        category._id,
        category.type,
      );
      return {
        ...category.toObject(),
        listingsCount,
      };
    })
  );

  return categoriesWithCount;
};

const getCategoryByIdFromDB = async (storeCategoryId: string) => {
  if (!mongoose.Types.ObjectId.isValid(storeCategoryId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  const category = await StoreCategory.findById(storeCategoryId);
  if (!category) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Category not found");
  }

  const listingsCount = await getCategoryListingsCount(
    category._id,
    category.type,
  );

  return {
    ...category.toObject(),
    listingsCount,
  };
};

const updateCategoryInDB = async (
  storeCategoryId: string,
  payload: Partial<IStoreCategory>,
) => {
  if (!mongoose.Types.ObjectId.isValid(storeCategoryId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  if (payload.name) {
    const isExist = await StoreCategory.findOne({
      name: payload.name,
      _id: { $ne: storeCategoryId },
    });
    if (isExist) {
      throw new ApiError(StatusCodes.CONFLICT, "Category name already exists");
    }
  }

  const category = await StoreCategory.findByIdAndUpdate(
    { _id: storeCategoryId },
    payload,
    { new: true },
  );

  if (!category) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Category not found to update");
  }
  return category;
};

const deleteCategoryFromDB = async (storeCategoryId: string) => {
  if (!mongoose.Types.ObjectId.isValid(storeCategoryId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  const category = await StoreCategory.softDeleteById(storeCategoryId);
  if (!category) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Category not found or already deleted",
    );
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
