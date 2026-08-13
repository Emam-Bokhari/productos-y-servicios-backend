import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { Store } from "./store.model";
import { StoreCategory } from "../storeCategory/storeCategory.model";
import { Seller } from "../seller/seller.model";
import { User } from "../user/user.model";
import { STORE_STATUS, STORE_TYPE } from "./store.constant";
import { Product } from "../product/product.model";
import { PRODUCT_STATUS } from "../product/product.constant";
import { Service } from "../service/service.model";
import { SERVICE_STATUS } from "../service/service.constant";
import QueryBuilder from "../../builder/queryBuilder";
import { CityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.model";
import { SLOT_CONFIG_STATUS } from "../cityAdConfiguration/cityAdConfiguration.constant";
import { DateTime } from "luxon";
import { StoreTraffic } from "../storeTraffic/storeTraffic.model";

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

  // Validate city exists in active configurations
  if (payload.city) {
    const activeCity = await CityAdConfiguration.findOne({
      city: { $regex: `^${payload.city.trim()}$`, $options: "i" },
      status: SLOT_CONFIG_STATUS.ACTIVE,
    });
    if (!activeCity) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `The selected city "${payload.city}" is not configured or active for stores.`,
      );
    }
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

  // Validate city exists in active configurations if changing
  if (
    payload.city &&
    payload.city.trim().toLowerCase() !== store.city?.toLowerCase()
  ) {
    const activeCity = await CityAdConfiguration.findOne({
      city: { $regex: `^${payload.city.trim()}$`, $options: "i" },
      status: SLOT_CONFIG_STATUS.ACTIVE,
    });
    if (!activeCity) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `The selected city "${payload.city}" is not configured or active for stores.`,
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

  if (!store) {
    return {
      seller: seller || null,
      status: null,
    };
  }

  return {
    ...store.toObject(),
    seller: seller || null,
  };
};

const updateStoreStatusInDB = async (storeId: string, status: string) => {
  const store = await Store.findById(storeId);
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Store not found");
  }

  store.status = status as any;
  await store.save();

  // If status is active, ensure seller status is active
  // If status is not active, set activeRole of owner to "user" and seller status to "inactive"
  if (status === "active") {
    await Seller.findOneAndUpdate({ user: store.owner }, { status: "active" });
  } else {
    await User.findByIdAndUpdate(store.owner, { activeRole: "user" });
    await Seller.findOneAndUpdate(
      { user: store.owner },
      { status: "inactive" },
    );
  }

  return store;
};

const getStoreDetailsFromDB = async (storeId: string) => {
  const store = await Store.findByIdAndUpdate(
    storeId,
    { $inc: { visitorCount: 1 } },
    { new: true },
  ).populate("categoryId");
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Store not found");
  }

  // Record daily traffic
  const defaultTimezone = "Asia/Dhaka";
  const todayInDhaka = DateTime.now().setZone(defaultTimezone).startOf("day");
  const todayUtc = todayInDhaka.toUTC().toJSDate();

  await StoreTraffic.findOneAndUpdate(
    { storeId: store._id, date: todayUtc },
    { $inc: { count: 1 } },
    { upsert: true, new: true },
  ).catch((err) => {
    console.error("Failed to increment store traffic log:", err);
  });

  if (store.status !== STORE_STATUS.ACTIVE) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Store is not active");
  }

  let products: any[] = [];
  let services: any[] = [];

  if (store.storeType === STORE_TYPE.PRODUCT_STORE) {
    products = await Product.find({
      storeId: store._id,
      status: PRODUCT_STATUS.ACTIVE,
    });
  } else if (store.storeType === STORE_TYPE.SERVICE_STORE) {
    services = await Service.find({
      storeId: store._id,
      status: SERVICE_STATUS.ACTIVE,
    });
  }

  return {
    store,
    products,
    services,
  };
};

const getAllStoresFromDB = async (query: Record<string, unknown>) => {
  const filterQuery: Record<string, any> = {
    status: STORE_STATUS.ACTIVE,
    sort: "displayName",
    ...query,
  };

  // Handle city configuration filtering via latitude/longitude or city/location name fallback
  let cityConfig = null;

  if (filterQuery.latitude && filterQuery.longitude) {
    const lat = parseFloat(filterQuery.latitude as string);
    const lng = parseFloat(filterQuery.longitude as string);
    delete filterQuery.latitude;
    delete filterQuery.longitude;

    if (!isNaN(lat) && !isNaN(lng)) {
      cityConfig = await CityAdConfiguration.findOne({
        latitude: lat,
        longitude: lng,
        status: SLOT_CONFIG_STATUS.ACTIVE,
      });
    }
  } else if (filterQuery.city) {
    const cityStr = filterQuery.city as string;
    delete filterQuery.city;
    if (cityStr) {
      cityConfig = await CityAdConfiguration.findOne({
        city: { $regex: `^${cityStr.trim()}$`, $options: "i" },
        status: SLOT_CONFIG_STATUS.ACTIVE,
      });
    }
  } else if (filterQuery.location) {
    const locationStr = filterQuery.location as string;
    delete filterQuery.location;
    if (locationStr) {
      cityConfig = await CityAdConfiguration.findOne({
        city: { $regex: `^${locationStr.trim()}$`, $options: "i" },
        status: SLOT_CONFIG_STATUS.ACTIVE,
      });
    }
  }

  // If a city config was successfully resolved, filter stores by its city name.
  // Otherwise, if any location-related filters were passed but not matched, return empty results.
  if (cityConfig) {
    filterQuery.city = { $regex: `^${cityConfig.city.trim()}$`, $options: "i" };
  } else if (
    query.latitude ||
    query.longitude ||
    query.city ||
    query.location
  ) {
    filterQuery.city = "NON_EXISTENT_CITY_FALLBACK_VAL_12345";
  }

  const builder = new QueryBuilder(Store.find(), filterQuery)
    .search(["displayName", "city", "streetAddress", "phone"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery.populate("categoryId");
  const meta = await builder.countTotal();

  return { data, meta };
};

const verifyStoreIdentityInDB = async (
  ownerId: string,
  payload: {
    documentType: "nid" | "passport";
    documentFront: string;
    documentBack?: string;
  },
) => {
  const store = await Store.findOne({ owner: ownerId });
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Store not found.");
  }

  // Update the identity verification fields and reset isVerified to false
  const updatedStore = await Store.findOneAndUpdate(
    { owner: ownerId },
    {
      $set: {
        documentType: payload.documentType,
        documentFront: payload.documentFront,
        documentBack: payload.documentBack || undefined,
        isVerified: false,
      },
    },
    { new: true },
  );

  if (!updatedStore) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to submit verification details",
    );
  }

  return updatedStore;
};

const updateStoreVerificationInDB = async (
  storeId: string,
  isVerified: boolean,
) => {
  const store = await Store.findById(storeId);
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Store not found.");
  }

  store.isVerified = isVerified;
  await store.save();

  return store;
};

const getSellerDashboardFromDB = async (ownerId: string) => {
  const store = await Store.findOne({ owner: ownerId });
  if (!store) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Store not found for this seller.",
    );
  }

  const totalProducts = await Product.countDocuments({ storeId: store._id });
  const totalServices = await Service.countDocuments({ storeId: store._id });
  const totalItems = totalProducts + totalServices;

  const totalVisitors = store.visitorCount || 0;

  const defaultTimezone = "Asia/Dhaka";
  const startOfWeek = DateTime.now().setZone(defaultTimezone).startOf("week");
  const endOfWeek = DateTime.now().setZone(defaultTimezone).endOf("week");

  // Fetch all traffic records for this week
  const trafficRecords = await StoreTraffic.find({
    storeId: store._id,
    date: {
      $gte: startOfWeek.toUTC().toJSDate(),
      $lte: endOfWeek.toUTC().toJSDate(),
    },
  });

  // Map to Monday through Sunday structure
  const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeklyTraffic = daysOfWeek.map((day, index) => {
    // luxon week starts on Monday, so index 0 = Mon, index 1 = Tue, etc.
    const dayDate = startOfWeek.plus({ days: index }).toUTC().toJSDate();
    const dayTime = dayDate.getTime();

    const record = trafficRecords.find((r) => r.date.getTime() === dayTime);

    return {
      day,
      count: record ? record.count : 0,
    };
  });

  return {
    totalItems,
    storeVisitors: totalVisitors,
    weeklyTraffic,
  };
};

export const StoreService = {
  createStoreToDB,
  updateStoreInDB,
  getMyStoreFromDB,
  updateStoreStatusInDB,
  getStoreDetailsFromDB,
  getAllStoresFromDB,
  verifyStoreIdentityInDB,
  updateStoreVerificationInDB,
  getSellerDashboardFromDB,
};
