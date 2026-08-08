import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { Store } from "./store.model";
import { StoreCategory } from "../storeCategory/storeCategory.model";
import { Seller } from "../seller/seller.model";

const createStoreToDB = async (ownerId: string, payload: any) => {
  // Check if user already has a store
  const existingStore = await Store.findOne({ owner: ownerId });
  if (existingStore) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `You already have a store which is in ${existingStore.status} status.`,
    );
  }

  const { categoryId, displayName, phone, businessLicenseNumber } = payload;

  // Validate category exists and is active
  const category = await StoreCategory.findById(categoryId);
  if (!category) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Selected category does not exist",
    );
  }
  if (category.status === "inactive") {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Selected category is inactive",
    );
  }

  // Validate duplicate display name
  const duplicateDisplayName = await Store.findOne({ displayName });
  if (duplicateDisplayName) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      "Display name is already taken by another store",
    );
  }

  // Validate duplicate phone
  const duplicatePhone = await Store.findOne({ phone });
  if (duplicatePhone) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      "Phone number is already linked with another store",
    );
  }

  // Validate duplicate business license number
  const duplicateLicense = await Store.findOne({ businessLicenseNumber });
  if (duplicateLicense) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      "Business License Number is already registered by another store",
    );
  }

  // Create a new store (status defaults to under_review)
  const store = await Store.create({
    ...payload,
    owner: ownerId,
    status: "under_review",
  });

  // Automatically create Seller Profile if not exists
  let seller = await Seller.findOne({ user: ownerId });
  if (!seller) {
    seller = await Seller.create({
      user: ownerId,
      store: store._id,
      status: "active",
    });
  }

  return { store, seller };
};

const updateStoreInDB = async (ownerId: string, payload: any) => {
  let store = await Store.findOne({ owner: ownerId });
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Store not found.");
  }

  if (store.status !== "under_review" && store.status !== "rejected") {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Cannot update store details when status is ${store.status}`,
    );
  }

  const { categoryId, displayName, phone, businessLicenseNumber } = payload;

  // Validate new category if changing
  if (categoryId && categoryId !== store.categoryId?.toString()) {
    const category = await StoreCategory.findById(categoryId);
    if (!category) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Selected category does not exist",
      );
    }
    if (category.status === "inactive") {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Selected category is inactive",
      );
    }
  }

  // Validate duplicate display name
  if (displayName && displayName !== store.displayName) {
    const duplicate = await Store.findOne({
      displayName,
      _id: { $ne: store._id },
    });
    if (duplicate) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        "Display name is already taken by another store",
      );
    }
  }

  // Validate duplicate phone
  if (phone && phone !== store.phone) {
    const duplicate = await Store.findOne({
      phone,
      _id: { $ne: store._id },
    });
    if (duplicate) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        "Phone number is already linked with another store",
      );
    }
  }

  // Validate duplicate license number
  if (
    businessLicenseNumber &&
    businessLicenseNumber !== store.businessLicenseNumber
  ) {
    const duplicate = await Store.findOne({
      businessLicenseNumber,
      _id: { $ne: store._id },
    });
    if (duplicate) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        "Business License Number is already registered by another store",
      );
    }
  }

  // Filter out undefined values to support partial patching
  const cleanedUpdateData = Object.fromEntries(
    Object.entries(payload).filter(([_, v]) => v !== undefined),
  );

  // If store status was rejected, reset it back to under_review on re-submission/edit
  if (store.status === "rejected") {
    cleanedUpdateData.status = "under_review";
  }

  const updatedStore = await Store.findOneAndUpdate(
    { owner: ownerId },
    { $set: cleanedUpdateData },
    { new: true },
  );

  if (!updatedStore) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update store");
  }

  // Automatically create Seller Profile if not exists
  let seller = await Seller.findOne({ user: ownerId });
  if (!seller) {
    seller = await Seller.create({
      user: ownerId,
      store: updatedStore._id,
      status: "active",
    });
  }

  return { store: updatedStore, seller };
};

const getMyStoreFromDB = async (ownerId: string) => {
  const store = await Store.findOne({ owner: ownerId });
  const seller = await Seller.findOne({ user: ownerId });

  return {
    store: store || null,
    seller: seller || null,
    status: store ? store.status : null,
  };
};

export const StoreService = {
  createStoreToDB,
  updateStoreInDB,
  getMyStoreFromDB,
};
