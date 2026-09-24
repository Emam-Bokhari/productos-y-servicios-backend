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
import { STATUS } from "../../../constants/status";
import { CATEGORY_TYPE } from "./storeCategory.constant";

const getCategoryListingsCount = async (
  categoryId: mongoose.Types.ObjectId | string,
  categoryType: string,
): Promise<number> => {
  // Find all child subcategories under this category
  const subCategories = await StoreCategory.find({
    parentId: categoryId,
    status: STATUS.ACTIVE,
  }).select("_id");
  const allCategoryIds = [categoryId, ...subCategories.map((c) => c._id)];

  const activeStores = await Store.find({
    $or: [
      { categoryId: { $in: allCategoryIds } },
      { subCategoryId: { $in: allCategoryIds } },
    ],
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
  let parentCategory: any = null;

  if (payload.parentId) {
    if (!mongoose.Types.ObjectId.isValid(payload.parentId.toString())) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid parent ID format");
    }
    parentCategory = await StoreCategory.findById(payload.parentId);
    if (!parentCategory) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Parent category not found");
    }
    // Child inherits parent type
    payload.type = parentCategory.type;
  } else {
    payload.parentId = null;
  }

  const isExist = await StoreCategory.findOne({
    name: { $regex: new RegExp(`^${payload.name.trim()}$`, "i") },
    type: payload.type,
    parentId: payload.parentId || null,
  });

  if (isExist) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      payload.parentId
        ? "Subcategory with this name already exists under the selected category"
        : "Category already exists with this name",
    );
  }

  const category = await StoreCategory.create(payload);
  if (!category) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to create category");
  }

  return await StoreCategory.findById(category._id).populate(
    "parentId",
    "name type",
  );
};

const getAllCategoriesFromDB = async (query: Record<string, any>) => {
  const {
    type,
    status,
    parentId,
    onlyParents,
    flat,
    all,
    includeSubCategories,
    tree,
    searchTerm,
  } = query;
  const filter: Record<string, any> = {};

  if (type) {
    filter.type = type;
  }
  if (status) {
    filter.status = status;
  }
  if (searchTerm && typeof searchTerm === "string" && searchTerm.trim()) {
    filter.name = { $regex: searchTerm.trim(), $options: "i" };
  }

  // Handle parentId / hierarchy filter
  if (parentId !== undefined) {
    if (parentId === "null" || parentId === "root" || parentId === "") {
      filter.parentId = null;
    } else if (mongoose.Types.ObjectId.isValid(parentId)) {
      filter.parentId = new mongoose.Types.ObjectId(parentId);
    }
  } else if (onlyParents === "true") {
    filter.parentId = null;
  }

  // If client requests flat list of all matching categories without nesting
  const isFlat = flat === "true" || all === "true";

  // If onlyParents is true or parentId is null/root: filter root categories
  if (onlyParents === "true" || parentId === "null" || parentId === "root") {
    filter.parentId = null;
  }

  // If no parentId specified and not requesting flat: default to root categories
  if (
    parentId === undefined &&
    onlyParents === undefined &&
    !isFlat &&
    !searchTerm
  ) {
    filter.parentId = null;
  }

  // Determine whether to populate subcategories
  const shouldIncludeSubCategories =
    includeSubCategories === "true" ||
    (onlyParents !== "true" && tree === "true");

  let categoriesQuery = StoreCategory.find(filter)
    .populate("parentId", "name type")
    .sort({ createdAt: 1 });

  if (shouldIncludeSubCategories) {
    categoriesQuery = categoriesQuery.populate({
      path: "subCategories",
      match: status ? { status } : {},
      select: "_id name description type status parentId createdAt updatedAt",
    });
  }

  const categories = await categoriesQuery;

  const categoriesWithCount = await Promise.all(
    categories.map(async (category) => {
      const listingsCount = await getCategoryListingsCount(
        category._id,
        category.type,
      );

      const catObj = category.toObject();

      // If subcategories exist and requested, compute their listingsCount
      if (
        shouldIncludeSubCategories &&
        Array.isArray(catObj.subCategories) &&
        catObj.subCategories.length > 0
      ) {
        catObj.subCategories = await Promise.all(
          catObj.subCategories.map(async (sub: any) => {
            const subCount = await getCategoryListingsCount(sub._id, sub.type);
            return {
              ...sub,
              listingsCount: subCount,
            };
          }),
        );
      } else {
        delete catObj.subCategories;
      }

      return {
        ...catObj,
        listingsCount,
      };
    }),
  );

  return categoriesWithCount;
};

const getCategoryByIdFromDB = async (storeCategoryId: string) => {
  if (!mongoose.Types.ObjectId.isValid(storeCategoryId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  const category = await StoreCategory.findById(storeCategoryId)
    .populate("parentId", "name type")
    .populate({
      path: "subCategories",
      select: "_id name description type status parentId createdAt updatedAt",
    });

  if (!category) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Category not found");
  }

  const listingsCount = await getCategoryListingsCount(
    category._id,
    category.type,
  );

  const catObj = category.toObject();
  if (Array.isArray(catObj.subCategories) && catObj.subCategories.length > 0) {
    catObj.subCategories = await Promise.all(
      catObj.subCategories.map(async (sub: any) => {
        const subCount = await getCategoryListingsCount(sub._id, sub.type);
        return {
          ...sub,
          listingsCount: subCount,
        };
      }),
    );
  }

  return {
    ...catObj,
    listingsCount,
  };
};

const getSubCategoriesByParentIdFromDB = async (parentId: string) => {
  if (!mongoose.Types.ObjectId.isValid(parentId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid parent ID format");
  }

  const subCategories = await StoreCategory.find({
    parentId,
  })
    .populate("parentId", "name type")
    .sort({ createdAt: 1 });

  const subCategoriesWithCount = await Promise.all(
    subCategories.map(async (sub) => {
      const listingsCount = await getCategoryListingsCount(
        sub._id,
        sub.type,
      );
      return {
        ...sub.toObject(),
        listingsCount,
      };
    }),
  );

  return subCategoriesWithCount;
};

const updateCategoryInDB = async (
  storeCategoryId: string,
  payload: Partial<IStoreCategory>,
) => {
  if (!mongoose.Types.ObjectId.isValid(storeCategoryId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  const existingCategory = await StoreCategory.findById(storeCategoryId);
  if (!existingCategory) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Category not found to update");
  }

  if (payload.parentId !== undefined) {
    if (payload.parentId) {
      if (!mongoose.Types.ObjectId.isValid(payload.parentId.toString())) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid parent ID format");
      }
      if (payload.parentId.toString() === storeCategoryId) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          "Category cannot be its own parent",
        );
      }
      const parent = await StoreCategory.findById(payload.parentId);
      if (!parent) {
        throw new ApiError(StatusCodes.NOT_FOUND, "Parent category not found");
      }
      payload.type = parent.type;
    } else {
      payload.parentId = null;
    }
  }

  const targetName = payload.name || existingCategory.name;
  const targetParentId =
    payload.parentId !== undefined ? payload.parentId : existingCategory.parentId;
  const targetType = payload.type || existingCategory.type;

  if (payload.name || payload.parentId !== undefined || payload.type) {
    const isExist = await StoreCategory.findOne({
      name: { $regex: new RegExp(`^${targetName.trim()}$`, "i") },
      parentId: targetParentId || null,
      type: targetType,
      _id: { $ne: storeCategoryId },
    });
    if (isExist) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        targetParentId
          ? "Subcategory with this name already exists under the selected category"
          : "Category with this name already exists",
      );
    }
  }

  const category = await StoreCategory.findByIdAndUpdate(
    storeCategoryId,
    payload,
    { new: true },
  ).populate("parentId", "name type");

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

  // Cascade soft delete all subcategories
  await StoreCategory.softDeleteMany({ parentId: storeCategoryId });

  return category;
};

export const StoreCategoryService = {
  createCategoryToDB,
  getAllCategoriesFromDB,
  getCategoryByIdFromDB,
  getSubCategoriesByParentIdFromDB,
  updateCategoryInDB,
  deleteCategoryFromDB,
};

