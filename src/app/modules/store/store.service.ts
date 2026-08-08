import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { Store } from "./store.model";
import { StoreCategory } from "../storeCategory/storeCategory.model";
import { Seller } from "../seller/seller.model";
import { IStore } from "./store.interface";

const createDraftStoreToDB = async (ownerId: string) => {
  // Check if user already has any store (even in draft, review, or active)
  let store = await Store.findOne({ owner: ownerId });

  if (store) {
    if (store.status === "draft") {
      return store;
    }
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `You already have a store which is in ${store.status} status.`
    );
  }

  // Create a new draft store
  store = await Store.create({
    owner: ownerId,
    status: "draft",
  });

  return store;
};

const getDraftStoreFromDB = async (ownerId: string) => {
  const store = await Store.findOne({ owner: ownerId, status: "draft" });
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No draft store found for this user");
  }
  return store;
};

const updateStepToDB = async (ownerId: string, step: number, payload: any) => {
  const store = await Store.findOne({ owner: ownerId });
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Store not found. Please create a draft store first.");
  }

  if (store.status !== "draft" && store.status !== "rejected") {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Cannot update store details when status is ${store.status}`
    );
  }

  // Apply step specific updates
  let updateData: Partial<IStore> = {};
  if (step === 1) {
    updateData = { storeType: payload.storeType };
  } else if (step === 2) {
    updateData = {
      displayName: payload.displayName,
      description: payload.description,
      categoryId: payload.categoryId,
      logo: payload.logo,
      coverImage: payload.coverImage,
    };
  } else if (step === 3) {
    updateData = {
      phone: payload.phone,
      whatsapp: payload.whatsapp,
      email: payload.email,
      streetAddress: payload.streetAddress,
      city: payload.city,
      postalCode: payload.postalCode,
      latitude: payload.latitude,
      longitude: payload.longitude,
    };
  } else if (step === 4) {
    updateData = {
      businessLicenseNumber: payload.businessLicenseNumber,
      tradeLicenseImage: payload.tradeLicenseImage,
      tinNumber: payload.tinNumber,
    };
  }

  // Filter out undefined values to support partial patching
  const cleanedUpdateData = Object.fromEntries(
    Object.entries(updateData).filter(([_, v]) => v !== undefined)
  );

  const updatedStore = await Store.findOneAndUpdate(
    { owner: ownerId },
    { $set: cleanedUpdateData },
    { new: true }
  );

  if (!updatedStore) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update store");
  }

  return updatedStore;
};

const publishStoreToDB = async (ownerId: string) => {
  const store = await Store.findOne({ owner: ownerId });
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "No store profile found to publish");
  }

  if (store.status === "active" || store.status === "under_review" || store.status === "suspended") {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Cannot publish store. Store status is already ${store.status}`
    );
  }

  // 1. Validate required fields for publishing
  const requiredFields = [
    { name: "storeType", value: store.storeType },
    { name: "displayName", value: store.displayName },
    { name: "description", value: store.description },
    { name: "categoryId", value: store.categoryId },
    { name: "logo", value: store.logo },
    { name: "coverImage", value: store.coverImage },
    { name: "phone", value: store.phone },
    { name: "email", value: store.email },
    { name: "streetAddress", value: store.streetAddress },
    { name: "city", value: store.city },
    { name: "postalCode", value: store.postalCode },
    { name: "businessLicenseNumber", value: store.businessLicenseNumber },
    { name: "tradeLicenseImage", value: store.tradeLicenseImage },
    { name: "tinNumber", value: store.tinNumber },
  ];

  for (const field of requiredFields) {
    if (!field.value) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Cannot publish store: ${field.name} is missing. Please complete all steps.`
      );
    }
  }

  // 2. Validate category exists
  const category = await StoreCategory.findById(store.categoryId);
  if (!category) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Selected category does not exist");
  }
  if (category.status === "inactive") {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Selected category is inactive");
  }

  // 3. Validate duplicates among non-draft stores
  const duplicateDisplayName = await Store.findOne({
    displayName: store.displayName,
    _id: { $ne: store._id },
    status: { $ne: "draft" },
  });
  if (duplicateDisplayName) {
    throw new ApiError(StatusCodes.CONFLICT, "Display name is already taken by another store");
  }

  const duplicatePhone = await Store.findOne({
    phone: store.phone,
    _id: { $ne: store._id },
    status: { $ne: "draft" },
  });
  if (duplicatePhone) {
    throw new ApiError(StatusCodes.CONFLICT, "Phone number is already linked with another store");
  }

  const duplicateLicense = await Store.findOne({
    businessLicenseNumber: store.businessLicenseNumber,
    _id: { $ne: store._id },
    status: { $ne: "draft" },
  });
  if (duplicateLicense) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      "Business License Number is already registered by another store"
    );
  }

  // 4. Update status to under_review
  store.status = "under_review";
  await store.save();

  // 5. Automatically create Seller Profile if not exists
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
  createDraftStoreToDB,
  getDraftStoreFromDB,
  updateStepToDB,
  publishStoreToDB,
  getMyStoreFromDB,
};