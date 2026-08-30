import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { Store } from "./store.model";
import { StoreCategory } from "../storeCategory/storeCategory.model";
import { Seller } from "../seller/seller.model";
import { User } from "../user/user.model";
import { USER_ROLES } from "../../../enums/user";
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
import { Subscription } from "../subscription/subscription.model";
import { SubscriptionPackage } from "../subscriptionPackage/subscriptionPackage.model";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";

const createStoreToDB = async (ownerId: string, payload: any) => {
  // Check if user already has a store
  const existingStore = await Store.findOne({ owner: ownerId });
  if (existingStore) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `You already have a store which is in ${existingStore.status} status.`,
    );
  }

  // Check if user has an active store creation subscription
  let activeSubscription = await Subscription.findOne({
    userId: ownerId,
    packageType: "store_creation",
    status: { $in: ["active", "trialing"] },
    expiresAt: { $gt: new Date() },
  });

  if (!activeSubscription) {
    // Check if user has ever had any store_creation subscription in the past
    const hasHadSubscription = await Subscription.findOne({
      userId: ownerId,
      packageType: "store_creation",
    });

    if (hasHadSubscription) {
      throw new ApiError(
        StatusCodes.PAYMENT_REQUIRED,
        "You must have an active store creation subscription to create a store.",
      );
    }

    // Since they have never had any store_creation subscription, they get a one-time free trial
    const trialPackage = await SubscriptionPackage.findOne({
      packageType: "store_creation",
      trialEnabled: true,
      status: "active",
    });

    if (!trialPackage) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "No active trial package configured for store creation.",
      );
    }

    const trialDays = trialPackage.trialPeriodDays || 0;
    if (trialDays <= 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Trial period duration must be greater than 0 days.",
      );
    }

    const expiresAt = DateTime.now().plus({ days: trialDays }).toJSDate();

    // Create the trial subscription
    activeSubscription = await Subscription.create({
      userId: ownerId,
      packageId: trialPackage._id,
      packageType: "store_creation",
      status: "trialing",
      expiresAt,
      trxId: "trial_activated",
    });

    // Update user subscription details
    await User.findByIdAndUpdate(ownerId, {
      subscriptionStatus: "trialing",
      subscriptionPackageId: trialPackage._id,
      subscriptionExpiresAt: expiresAt,
    });

    await sendNotifications({
      receiver: ownerId.toString(),
      title: "Trial Subscription Activated",
      text: `Your ${trialDays}-day free trial has been successfully activated.`,
      type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
      referenceId: activeSubscription._id,
      referenceModel: "Subscription",
    });
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
  if (payload.cityId) {
    const activeCity = await CityAdConfiguration.findOne({
      _id: payload.cityId,
      status: SLOT_CONFIG_STATUS.ACTIVE,
    });
    if (!activeCity) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "The selected city configuration is not configured or active for stores.",
      );
    }
  }

  if (payload.timezone) {
    await User.findByIdAndUpdate(ownerId, { timezone: payload.timezone });
    delete payload.timezone;
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
  if (payload.cityId && payload.cityId !== store.cityId?.toString()) {
    const activeCity = await CityAdConfiguration.findOne({
      _id: payload.cityId,
      status: SLOT_CONFIG_STATUS.ACTIVE,
    });
    if (!activeCity) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "The selected city configuration is not configured or active for stores.",
      );
    }
  }

  if (payload.timezone) {
    await User.findByIdAndUpdate(ownerId, { timezone: payload.timezone });
    delete payload.timezone;
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
  const store = await Store.findOne({ owner: ownerId }).populate("cityId");
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

const getStoreDetailsFromDB = async (storeId: string, user: any) => {
  const store = await Store.findByIdAndUpdate(
    storeId,
    { $inc: { visitorCount: 1 } },
    { new: true },
  )
    .populate("categoryId")
    .populate("owner", "name profileImage email phone")
    .populate("cityId");
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Store not found");
  }

  // Record daily traffic
  const ownerUser: any = store.owner;
  const defaultTimezone = ownerUser?.timezone || "Asia/Dhaka";
  const todayInTimezone = DateTime.now().setZone(defaultTimezone).startOf("day");
  const todayUtc = todayInTimezone.toUTC().toJSDate();

  await StoreTraffic.findOneAndUpdate(
    { storeId: store._id, date: todayUtc },
    { $inc: { count: 1 } },
    { upsert: true, new: true },
  ).catch((err) => {
    console.error("Failed to increment store traffic log:", err);
  });

  const isAdminOrSuperAdmin =
    user &&
    (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN);

  if (!isAdminOrSuperAdmin && store.status !== STORE_STATUS.ACTIVE) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Store is not active");
  }

  let products: any[] = [];
  let services: any[] = [];

  if (store.storeType === STORE_TYPE.PRODUCT_STORE) {
    products = await Product.find({
      storeId: store._id,
      ...(isAdminOrSuperAdmin ? {} : { status: PRODUCT_STATUS.ACTIVE }),
    });
  } else if (store.storeType === STORE_TYPE.SERVICE_STORE) {
    services = await Service.find({
      storeId: store._id,
      ...(isAdminOrSuperAdmin ? {} : { status: SERVICE_STATUS.ACTIVE }),
    });
  }

  // Find active subscription plan
  const activeSubscription = await Subscription.findOne({
    userId: store.owner ? (store.owner as any)._id : null,
    packageType: "store_creation",
    status: { $in: ["active", "trialing"] },
    expiresAt: { $gt: new Date() },
  }).populate("packageId");

  const planName = activeSubscription
    ? (activeSubscription.packageId as any)?.name || "Starter"
    : "N/A";

  let listingsCount = 0;
  if (store.storeType === STORE_TYPE.PRODUCT_STORE) {
    listingsCount = await Product.countDocuments({ storeId: store._id });
  } else if (store.storeType === STORE_TYPE.SERVICE_STORE) {
    listingsCount = await Service.countDocuments({ storeId: store._id });
  }

  const storeWithDetails = {
    ...store.toObject(),
    plan: planName,
    listings: listingsCount,
  };

  return {
    store: storeWithDetails,
    products,
    services,
  };
};

const getAllStoresFromDB = async (
  query: Record<string, unknown>,
  user: any,
) => {
  const { searchTerm, status, storeType, rating, openNow, ...remainingQuery } = query;

  const filter: Record<string, any> = {};
  const andConditions: any[] = [];

  const isAdminOrSuperAdmin =
    user &&
    (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN);

  // Status filtering logic
  if (isAdminOrSuperAdmin) {
    if (status && status !== "all") {
      filter.status = status;
    }
  } else {
    filter.status = STORE_STATUS.ACTIVE;
  }

  // Store type filtering logic
  if (storeType && storeType !== "all") {
    if (storeType === "product") {
      filter.storeType = STORE_TYPE.PRODUCT_STORE;
    } else if (storeType === "service") {
      filter.storeType = STORE_TYPE.SERVICE_STORE;
    } else {
      filter.storeType = storeType;
    }
  }

  // Rating filtering logic
  if (rating) {
    const ratingVal = parseInt(rating as string, 10);
    if (!isNaN(ratingVal)) {
      filter.averageRating = { $gte: ratingVal };
    }
  }

  // Open now filter logic
  if (openNow === "true" || openNow === true) {
    // 1. Get all unique timezones of users who are sellers
    const distinctTimezones = await User.distinct("timezone");
    const timezones = distinctTimezones.filter(Boolean);
    const usersByTimezone: Record<string, any[]> = {};

    const activeUsers = await User.find({
      role: USER_ROLES.SELLER,
      timezone: { $in: timezones },
    }).select("_id timezone");

    for (const u of activeUsers) {
      const tz = u.timezone || "Asia/Dhaka";
      if (!usersByTimezone[tz]) {
        usersByTimezone[tz] = [];
      }
      usersByTimezone[tz].push(u._id);
    }

    const openTimezoneConditions: any[] = [];

    // 2. Add conditions for each unique timezone
    for (const tz of Object.keys(usersByTimezone)) {
      const nowInTimezone = DateTime.now().setZone(tz);
      if (!nowInTimezone.isValid) continue;
      const currentDayName = nowInTimezone.toFormat("EEEE").toLowerCase();
      const currentTimeStr = nowInTimezone.toFormat("HH:mm");
      const ownerIds = usersByTimezone[tz] || [];
      if (ownerIds.length === 0) continue;

      openTimezoneConditions.push({
        owner: { $in: ownerIds },
        $or: [
          { isOpen24Hours: true },
          {
            isOpen24Hours: { $ne: true },
            workingDays: currentDayName,
            $or: [
              {
                // Normal operating hours (e.g., 09:00 to 18:00)
                $expr: { $lte: ["$openingTime", "$closingTime"] },
                openingTime: { $lte: currentTimeStr },
                closingTime: { $gte: currentTimeStr },
              },
              {
                // Overnight operating hours (e.g., 22:00 to 02:00)
                $expr: { $gt: ["$openingTime", "$closingTime"] },
                $or: [
                  { openingTime: { $lte: currentTimeStr } },
                  { closingTime: { $gte: currentTimeStr } },
                ],
              },
            ],
          },
        ],
      });
    }

    // 3. Fallback for users/stores who do not have a timezone set (defaults to Asia/Dhaka)
    const usersWithoutTimezone = await User.find({
      role: USER_ROLES.SELLER,
      $or: [
        { timezone: { $exists: false } },
        { timezone: null },
        { timezone: "Asia/Dhaka" },
      ],
    }).select("_id");
    const ownerIdsWithoutTimezone = usersWithoutTimezone.map((u) => u._id);

    const nowInDhaka = DateTime.now().setZone("Asia/Dhaka");
    const currentDayNameDhaka = nowInDhaka.toFormat("EEEE").toLowerCase();
    const currentTimeStrDhaka = nowInDhaka.toFormat("HH:mm");

    openTimezoneConditions.push({
      $and: [
        {
          $or: [
            { owner: { $in: ownerIdsWithoutTimezone } },
            { owner: { $exists: false } },
          ],
        },
        {
          $or: [
            { isOpen24Hours: true },
            {
              isOpen24Hours: { $ne: true },
              workingDays: currentDayNameDhaka,
              $or: [
                {
                  // Normal operating hours (e.g., 09:00 to 18:00)
                  $expr: { $lte: ["$openingTime", "$closingTime"] },
                  openingTime: { $lte: currentTimeStrDhaka },
                  closingTime: { $gte: currentTimeStrDhaka },
                },
                {
                  // Overnight operating hours (e.g., 22:00 to 02:00)
                  $expr: { $gt: ["$openingTime", "$closingTime"] },
                  $or: [
                    { openingTime: { $lte: currentTimeStrDhaka } },
                    { closingTime: { $gte: currentTimeStrDhaka } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    andConditions.push({ $or: openTimezoneConditions });
  }

  // Search term logic
  if (searchTerm) {
    const categories = await StoreCategory.find({
      name: { $regex: searchTerm, $options: "i" },
    }).select("_id");
    const categoryIds = categories.map((c) => c._id);

    const users = await User.find({
      name: { $regex: searchTerm, $options: "i" },
    }).select("_id");
    const userIds = users.map((u) => u._id);

    const cityAdConfigs = await CityAdConfiguration.find({
      city: { $regex: searchTerm, $options: "i" },
    }).select("_id");
    const cityAdConfigIds = cityAdConfigs.map((c) => c._id);

    andConditions.push({
      $or: [
        { displayName: { $regex: searchTerm, $options: "i" } },
        { phone: { $regex: searchTerm, $options: "i" } },
        { cityId: { $in: cityAdConfigIds } },
        { categoryId: { $in: categoryIds } },
        { owner: { $in: userIds } },
      ],
    });
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  // Handle direct cityId query parameter
  if (remainingQuery.cityId) {
    filter.cityId = remainingQuery.cityId;
    delete remainingQuery.cityId;
  }

  // Handle city configuration filtering via latitude/longitude or city/location name fallback
  let cityConfig = null;

  if (remainingQuery.latitude && remainingQuery.longitude) {
    const lat = parseFloat(remainingQuery.latitude as string);
    const lng = parseFloat(remainingQuery.longitude as string);
    delete remainingQuery.latitude;
    delete remainingQuery.longitude;

    if (!isNaN(lat) && !isNaN(lng)) {
      cityConfig = await CityAdConfiguration.findOne({
        latitude: lat,
        longitude: lng,
        status: SLOT_CONFIG_STATUS.ACTIVE,
      });
    }
  } else if (remainingQuery.city) {
    const cityStr = remainingQuery.city as string;
    delete remainingQuery.city;
    if (cityStr) {
      cityConfig = await CityAdConfiguration.findOne({
        city: { $regex: `^${cityStr.trim()}$`, $options: "i" },
        status: SLOT_CONFIG_STATUS.ACTIVE,
      });
    }
  } else if (remainingQuery.location) {
    const locationStr = remainingQuery.location as string;
    delete remainingQuery.location;
    if (locationStr) {
      cityConfig = await CityAdConfiguration.findOne({
        city: { $regex: `^${locationStr.trim()}$`, $options: "i" },
        status: SLOT_CONFIG_STATUS.ACTIVE,
      });
    }
  }

  if (cityConfig) {
    filter.cityId = cityConfig._id;
  } else if (
    query.latitude ||
    query.longitude ||
    query.city ||
    query.location
  ) {
    filter.cityId = new Types.ObjectId();
  }

  const builder = new QueryBuilder(Store.find(), remainingQuery)
    .filter()
    .sort()
    .paginate()
    .fields();

  builder.modelQuery = builder.modelQuery.find(filter);

  const rawStores = await builder.modelQuery
    .populate("categoryId")
    .populate("owner", "name profileImage email phone")
    .populate("cityId");

  const meta = await builder.countTotal();

  const data = await Promise.all(
    rawStores.map(async (store) => {
      const storeObj = store.toObject();

      const activeSubscription = await Subscription.findOne({
        userId: store.owner ? (store.owner as any)._id : null,
        packageType: "store_creation",
        status: { $in: ["active", "trialing"] },
        expiresAt: { $gt: new Date() },
      }).populate("packageId");

      const planName = activeSubscription
        ? (activeSubscription.packageId as any)?.name || "Starter"
        : "N/A";

      let listingsCount = 0;
      if (store.storeType === STORE_TYPE.PRODUCT_STORE) {
        listingsCount = await Product.countDocuments({ storeId: store._id });
      } else if (store.storeType === STORE_TYPE.SERVICE_STORE) {
        listingsCount = await Service.countDocuments({ storeId: store._id });
      }

      return {
        ...storeObj,
        plan: planName,
        listings: listingsCount,
      };
    }),
  );

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

  const owner = await User.findById(ownerId);
  const defaultTimezone = owner?.timezone || "Asia/Dhaka";
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
