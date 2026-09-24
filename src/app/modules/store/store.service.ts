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
import { Review } from "../review/review.model";
import { Favorite } from "../favorite/favorite.model";
import { FAVORITE_TYPE } from "../../../enums/favorite";

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

  // Validate city/location exists in active configurations
  if (payload.cityId) {
    const activeCity = await CityAdConfiguration.findOne({
      _id: payload.cityId,
      status: SLOT_CONFIG_STATUS.ACTIVE,
    });
    if (!activeCity) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "The selected location configuration is not configured or active for stores.",
      );
    }
    // Auto-fill hierarchy fields if not explicitly provided
    payload.country = payload.country || activeCity.country;
    payload.province = payload.province || activeCity.province;
    payload.city = payload.city || activeCity.city;
    payload.canton = payload.canton || activeCity.canton || activeCity.city;
    payload.sector = payload.sector || activeCity.sector;
    payload.neighborhood = payload.neighborhood || activeCity.neighborhood;
    if (payload.latitude === undefined && activeCity.latitude) {
      payload.latitude = activeCity.latitude;
    }
    if (payload.longitude === undefined && activeCity.longitude) {
      payload.longitude = activeCity.longitude;
    }
  }

  if (payload.timezone) {
    await User.findByIdAndUpdate(ownerId, { timezone: payload.timezone });
    delete payload.timezone;
  }

  const ownerUser = await User.findById(ownerId);

  // Create a new store (status defaults to under_review)
  const store = await Store.create({
    ...payload,
    owner: ownerId,
    documentType: payload.documentType || ownerUser?.documentType,
    documentNumber: payload.documentNumber || ownerUser?.documentNumber,
    documentFront: payload.documentFront || ownerUser?.documentFront,
    documentBack: payload.documentBack || ownerUser?.documentBack,
    isVerified:
      payload.isVerified !== undefined
        ? payload.isVerified
        : ownerUser?.isVerified ?? false,
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

  // Validate location exists in active configurations if changing
  if (payload.cityId && payload.cityId !== store.cityId?.toString()) {
    const activeCity = await CityAdConfiguration.findOne({
      _id: payload.cityId,
      status: SLOT_CONFIG_STATUS.ACTIVE,
    });
    if (!activeCity) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "The selected location configuration is not configured or active for stores.",
      );
    }
    payload.country = payload.country || activeCity.country;
    payload.province = payload.province || activeCity.province;
    payload.city = payload.city || activeCity.city;
    payload.canton = payload.canton || activeCity.canton || activeCity.city;
    payload.sector = payload.sector || activeCity.sector;
    payload.neighborhood = payload.neighborhood || activeCity.neighborhood;
    if (payload.latitude === undefined && activeCity.latitude) {
      payload.latitude = activeCity.latitude;
    }
    if (payload.longitude === undefined && activeCity.longitude) {
      payload.longitude = activeCity.longitude;
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
  const store = await Store.findOne({ owner: ownerId })
    .populate("cityId")
    .populate("categoryId");
  const seller = await Seller.findOne({ user: ownerId });

  if (!store) {
    return {
      seller: seller || null,
      status: null,
      products: [],
      services: [],
      reviews: [],
      ratingStats: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      averageRating: 0,
      ratingCount: 0,
      totalReviews: 0,
      plan: "N/A",
      listings: 0,
    };
  }

  const [products, services, reviews, ratingStats, activeSubscription] =
    await Promise.all([
      Product.find({ storeId: store._id }).sort({ createdAt: -1 }),
      Service.find({ storeId: store._id }).sort({ createdAt: -1 }),
      Review.find({ storeId: store._id })
        .populate({
          path: "userId",
          select: "name profileImage email role activeRole",
        })
        .sort({ createdAt: -1 }),
      Review.aggregate([
        {
          $match: {
            storeId: new Types.ObjectId(store._id.toString()),
          },
        },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
      ]),
      Subscription.findOne({
        userId: ownerId,
        packageType: "store_creation",
        status: { $in: ["active", "trialing"] },
        expiresAt: { $gt: new Date() },
      }).populate("packageId"),
    ]);

  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratingStats.forEach((stat: any) => {
    const r = stat._id as number;
    if (breakdown[r] !== undefined) {
      breakdown[r] = stat.count;
    }
  });

  const planName = activeSubscription
    ? (activeSubscription.packageId as any)?.name || "Starter"
    : "N/A";

  const totalReviews = store.ratingCount || reviews.length;
  const averageRating = store.averageRating || 0;
  const listingsCount = products.length + services.length;

  return {
    ...store.toObject(),
    seller: seller || null,
    plan: planName,
    listings: listingsCount,
    products,
    services,
    reviews,
    ratingStats: breakdown,
    averageRating,
    ratingCount: totalReviews,
    totalReviews,
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
  const todayInTimezone = DateTime.now()
    .setZone(defaultTimezone)
    .startOf("day");
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

  const currentUserId = user?.id || user?._id;
  let isStoreFavorite = false;
  if (currentUserId) {
    const existing = await Favorite.exists({
      userId: currentUserId,
      targetId: store._id,
      targetType: {
        $in: [FAVORITE_TYPE.PRODUCT_STORE, FAVORITE_TYPE.SERVICE_STORE],
      },
    });
    isStoreFavorite = !!existing;
  }

  const storeWithDetails = {
    ...store.toObject(),
    plan: planName,
    listings: listingsCount,
    isFavorite: isStoreFavorite,
  };

  let productsWithFavorite: any[] = [];
  let servicesWithFavorite: any[] = [];

  if (products.length > 0) {
    let favProductSet = new Set<string>();
    if (currentUserId) {
      const favProducts = await Favorite.find({
        userId: currentUserId,
        targetId: { $in: products.map((p) => p._id) },
        targetType: FAVORITE_TYPE.PRODUCT,
      }).select("targetId");
      favProductSet = new Set(
        favProducts.map((f: any) => f.targetId.toString()),
      );
    }
    productsWithFavorite = products.map((p) => {
      const isFav = currentUserId ? favProductSet.has(p._id.toString()) : false;
      return {
        ...(p.toObject ? p.toObject() : p),
        isFavorite: isFav,
      };
    });
  }

  if (services.length > 0) {
    let favServiceSet = new Set<string>();
    if (currentUserId) {
      const favServices = await Favorite.find({
        userId: currentUserId,
        targetId: { $in: services.map((s) => s._id) },
        targetType: FAVORITE_TYPE.SERVICE,
      }).select("targetId");
      favServiceSet = new Set(
        favServices.map((f: any) => f.targetId.toString()),
      );
    }
    servicesWithFavorite = services.map((s) => {
      const isFav = currentUserId ? favServiceSet.has(s._id.toString()) : false;
      return {
        ...(s.toObject ? s.toObject() : s),
        isFavorite: isFav,
      };
    });
  }

  return {
    store: storeWithDetails,
    products: productsWithFavorite,
    services: servicesWithFavorite,
  };
};

const getAllStoresFromDB = async (
  query: Record<string, unknown>,
  user: any,
) => {
  const { searchTerm, status, storeType, rating, openNow, ...remainingQuery } =
    query;

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
    // 1. Get all unique timezones of users
    const distinctTimezones = await User.distinct("timezone");
    const timezones = distinctTimezones.filter(Boolean);
    const usersByTimezone: Record<string, any[]> = {};

    const activeUsers = await User.find({
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
      $or: [
        { timezone: { $exists: false } },
        { timezone: null },
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
      $or: [
        { country: { $regex: searchTerm, $options: "i" } },
        { province: { $regex: searchTerm, $options: "i" } },
        { city: { $regex: searchTerm, $options: "i" } },
        { canton: { $regex: searchTerm, $options: "i" } },
        { sector: { $regex: searchTerm, $options: "i" } },
        { neighborhood: { $regex: searchTerm, $options: "i" } },
      ],
    }).select("_id");
    const cityAdConfigIds = cityAdConfigs.map((c) => c._id);

    andConditions.push({
      $or: [
        { displayName: { $regex: searchTerm, $options: "i" } },
        { phone: { $regex: searchTerm, $options: "i" } },
        { documentNumber: { $regex: searchTerm, $options: "i" } },
        { streetAddress: { $regex: searchTerm, $options: "i" } },
        { country: { $regex: searchTerm, $options: "i" } },
        { province: { $regex: searchTerm, $options: "i" } },
        { city: { $regex: searchTerm, $options: "i" } },
        { canton: { $regex: searchTerm, $options: "i" } },
        { sector: { $regex: searchTerm, $options: "i" } },
        { neighborhood: { $regex: searchTerm, $options: "i" } },
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

  // Handle location hierarchy filtering (country, province, city, canton, sector, neighborhood)
  const locFilters: Record<string, any> = { status: SLOT_CONFIG_STATUS.ACTIVE };
  let hasLocationFilter = false;

  if (remainingQuery.country) {
    locFilters.country = {
      $regex: `^${(remainingQuery.country as string).trim()}$`,
      $options: "i",
    };
    delete remainingQuery.country;
    hasLocationFilter = true;
  }
  if (remainingQuery.province) {
    locFilters.province = {
      $regex: `^${(remainingQuery.province as string).trim()}$`,
      $options: "i",
    };
    delete remainingQuery.province;
    hasLocationFilter = true;
  }
  if (remainingQuery.city) {
    locFilters.city = {
      $regex: `^${(remainingQuery.city as string).trim()}$`,
      $options: "i",
    };
    delete remainingQuery.city;
    hasLocationFilter = true;
  }
  if (remainingQuery.canton) {
    locFilters.$or = [
      {
        canton: {
          $regex: `^${(remainingQuery.canton as string).trim()}$`,
          $options: "i",
        },
      },
      {
        city: {
          $regex: `^${(remainingQuery.canton as string).trim()}$`,
          $options: "i",
        },
      },
    ];
    delete remainingQuery.canton;
    hasLocationFilter = true;
  }
  if (remainingQuery.sector) {
    locFilters.sector = {
      $regex: `^${(remainingQuery.sector as string).trim()}$`,
      $options: "i",
    };
    delete remainingQuery.sector;
    hasLocationFilter = true;
  }
  if (remainingQuery.neighborhood) {
    locFilters.neighborhood = {
      $regex: `^${(remainingQuery.neighborhood as string).trim()}$`,
      $options: "i",
    };
    delete remainingQuery.neighborhood;
    hasLocationFilter = true;
  }

  if (remainingQuery.latitude && remainingQuery.longitude) {
    const lat = parseFloat(remainingQuery.latitude as string);
    const lng = parseFloat(remainingQuery.longitude as string);
    delete remainingQuery.latitude;
    delete remainingQuery.longitude;

    if (!isNaN(lat) && !isNaN(lng)) {
      locFilters.latitude = lat;
      locFilters.longitude = lng;
      hasLocationFilter = true;
    }
  } else if (remainingQuery.location) {
    const locationStr = (remainingQuery.location as string).trim();
    delete remainingQuery.location;
    if (locationStr) {
      locFilters.$or = [
        { city: { $regex: locationStr, $options: "i" } },
        { canton: { $regex: locationStr, $options: "i" } },
        { sector: { $regex: locationStr, $options: "i" } },
        { neighborhood: { $regex: locationStr, $options: "i" } },
        { province: { $regex: locationStr, $options: "i" } },
        { country: { $regex: locationStr, $options: "i" } },
      ];
      hasLocationFilter = true;
    }
  }

  if (hasLocationFilter) {
    const matchedConfigs = await CityAdConfiguration.find(locFilters).select(
      "_id",
    );
    const matchedConfigIds = matchedConfigs.map((c) => c._id);
    if (matchedConfigIds.length > 0) {
      filter.cityId = { $in: matchedConfigIds };
    } else {
      filter.cityId = new Types.ObjectId();
    }
  }

  const builder = new QueryBuilder(Store.find(), remainingQuery)
    .filter()
    .sort()
    .paginate()
    .fields();

  builder.modelQuery = builder.modelQuery.find(filter);

  const [rawStores, meta] = await Promise.all([
    builder.modelQuery
      .populate("categoryId")
      .populate("owner", "name profileImage email phone")
      .populate("cityId")
      .lean(),
    builder.countTotal(),
  ]);

  const currentUserId = user?.id || user?._id;
  const storeIds = rawStores.map((s: any) => s._id);
  const ownerIds = [
    ...new Set(
      rawStores
        .map((s: any) => s.owner?._id?.toString() || s.owner?.toString())
        .filter(Boolean),
    ),
  ];

  const productStoreIds = rawStores
    .filter((s: any) => s.storeType === STORE_TYPE.PRODUCT_STORE)
    .map((s: any) => s._id);

  const serviceStoreIds = rawStores
    .filter((s: any) => s.storeType === STORE_TYPE.SERVICE_STORE)
    .map((s: any) => s._id);

  const now = new Date();

  // Execute all related batch queries concurrently
  const [userFavorites, activeSubscriptions, productCounts, serviceCounts] =
    await Promise.all([
      currentUserId && storeIds.length > 0
        ? Favorite.find({
            userId: currentUserId,
            targetId: { $in: storeIds },
            targetType: {
              $in: [FAVORITE_TYPE.PRODUCT_STORE, FAVORITE_TYPE.SERVICE_STORE],
            },
          })
            .select("targetId")
            .lean()
        : Promise.resolve([]),

      ownerIds.length > 0
        ? Subscription.find({
            userId: { $in: ownerIds },
            packageType: "store_creation",
            status: { $in: ["active", "trialing"] },
            expiresAt: { $gt: now },
          })
            .populate("packageId", "name")
            .lean()
        : Promise.resolve([]),

      productStoreIds.length > 0
        ? Product.aggregate([
            { $match: { storeId: { $in: productStoreIds } } },
            { $group: { _id: "$storeId", count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),

      serviceStoreIds.length > 0
        ? Service.aggregate([
            { $match: { storeId: { $in: serviceStoreIds } } },
            { $group: { _id: "$storeId", count: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
    ]);

  // Index favorites
  const favoriteStoreIdSet = new Set(
    userFavorites.map((f: any) => f.targetId.toString()),
  );

  // Index active subscriptions by ownerId
  const subMap = new Map<string, any>();
  for (const sub of activeSubscriptions) {
    const uId =
      (sub as any).userId?._id?.toString() || (sub as any).userId?.toString();
    if (uId && !subMap.has(uId)) {
      subMap.set(uId, sub);
    }
  }

  // Index listings count by storeId
  const listingsMap = new Map<string, number>();
  for (const p of productCounts) {
    listingsMap.set(p._id.toString(), p.count);
  }
  for (const s of serviceCounts) {
    listingsMap.set(s._id.toString(), s.count);
  }

  // Synchronously assemble response
  const data = rawStores.map((store: any) => {
    const storeObj = store;
    const ownerIdStr =
      store.owner?._id?.toString() || store.owner?.toString() || "";
    const activeSub = ownerIdStr ? subMap.get(ownerIdStr) : null;
    const planName = activeSub
      ? activeSub.packageId?.name || "Starter"
      : "N/A";

    const listingsCount = listingsMap.get(store._id.toString()) || 0;
    const isFav = currentUserId
      ? favoriteStoreIdSet.has(store._id.toString())
      : false;

    return {
      ...storeObj,
      plan: planName,
      listings: listingsCount,
      isFavorite: isFav,
    };
  });

  return { data, meta };
};

const verifyStoreIdentityInDB = async (
  ownerId: string,
  payload: {
    documentType: "nid" | "passport";
    documentNumber?: string;
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
        ...(payload.documentNumber
          ? { documentNumber: payload.documentNumber }
          : {}),
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

  // Also sync to User
  await User.findByIdAndUpdate(ownerId, {
    documentType: payload.documentType,
    ...(payload.documentNumber
      ? { documentNumber: payload.documentNumber }
      : {}),
    documentFront: payload.documentFront,
    documentBack: payload.documentBack || undefined,
    isVerified: false,
  });

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

  // Also sync verification status to owner User
  if (store.owner) {
    await User.findByIdAndUpdate(store.owner, { isVerified });
  }

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
