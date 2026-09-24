import mongoose, { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { jwtHelper } from "../../../helpers/jwtHelper";
import config from "../../../config";
import { Secret } from "jsonwebtoken";
import {
  ADVERTISEMENT_STATUS,
  ADVERTISEMENT_TYPE,
  SLOT_CONFIG_STATUS,
} from "./advertisement.constant";
import { IAdvertisement } from "./advertisement.interface";
import { CityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.model";
import { Advertisement } from "./advertisement.model";
import { Store } from "../store/store.model";
import { User } from "../user/user.model";
import QueryBuilder from "../../builder/queryBuilder";
import { Subscription } from "../subscription/subscription.model";
import { SubscriptionPackage } from "../subscriptionPackage/subscriptionPackage.model";
import { Transaction } from "../transaction/transaction.model";
import { PAYMENT_METHOD } from "../transaction/transaction.constant";
import { DateTime } from "luxon";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";

// helper to calculate maximum concurrent bookings for a given date range
export const getOverlappingBookedSlots = async (
  cityAdConfigId: Types.ObjectId,
  advertisementType: string,
  startDate: Date,
  endDate: Date,
  session?: mongoose.ClientSession,
): Promise<{ bookedSlots: number; overlappingAds: any[] }> => {
  const query = {
    cityAdConfigId,
    advertisementType,
    status: ADVERTISEMENT_STATUS.ACTIVE,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  const overlappingAds = session
    ? await Advertisement.find(query).session(session)
    : await Advertisement.find(query);

  if (overlappingAds.length === 0) {
    return { bookedSlots: 0, overlappingAds: [] };
  }

  // Find all critical points in time where the concurrent count could change
  const pointsToCheck = new Set<number>();
  pointsToCheck.add(startDate.getTime());
  pointsToCheck.add(endDate.getTime());

  overlappingAds.forEach((ad) => {
    const adStart = new Date(ad.startDate).getTime();
    if (adStart >= startDate.getTime() && adStart <= endDate.getTime()) {
      pointsToCheck.add(adStart);
    }
    const adEnd = new Date(ad.endDate).getTime();
    if (adEnd >= startDate.getTime() && adEnd <= endDate.getTime()) {
      pointsToCheck.add(adEnd);
    }
  });

  let maxBooked = 0;
  pointsToCheck.forEach((pointTime) => {
    const pointDate = new Date(pointTime);
    const count = overlappingAds.filter(
      (ad) => ad.startDate <= pointDate && ad.endDate >= pointDate,
    ).length;
    if (count > maxBooked) {
      maxBooked = count;
    }
  });

  return { bookedSlots: maxBooked, overlappingAds };
};

// ----------------------------------------------------
// ADMIN ACTIONS
// ----------------------------------------------------

// ----------------------------------------------------
// SELLER / USER ACTIONS
// ----------------------------------------------------

const verifySellerForPostingInDB = async (userId: string): Promise<any> => {
  const store = await Store.findOne({ owner: userId });

  if (!store) {
    return {
      hasStore: false,
      isActive: false,
      action: "create_store",
      message: "Please create a store profile first.",
    };
  }

  if (store.status !== "active") {
    return {
      hasStore: true,
      isActive: false,
      status: store.status,
      action: "view_store_status",
      message: `Your store status is "${store.status}". It must be active to create ads.`,
    };
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User profile not found");
  }

  const currentRole = user.activeRole || user.role;

  if (currentRole === "seller") {
    return {
      hasStore: true,
      isActive: true,
      currentRole: "seller",
      action: "proceed_to_post",
      message: "Seller profile is active and verified.",
    };
  }

  // Switch user to seller automatically
  user.activeRole = "seller";
  await user.save();

  // Generate new Access and Refresh Tokens
  const accessToken = jwtHelper.createToken(
    {
      id: user._id,
      role: "seller",
      email: user.email,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  let refreshToken = undefined;
  if (config.jwt.jwtRefreshSecret) {
    refreshToken = jwtHelper.createToken(
      {
        id: user._id,
        role: "seller",
        email: user.email,
      },
      config.jwt.jwtRefreshSecret as Secret,
      (config.jwt.jwtRefreshExpiresIn as string) || "365d",
    );
  }

  return {
    hasStore: true,
    isActive: true,
    currentRole: currentRole,
    action: "switched_and_proceed",
    message: "Successfully switched active role to seller.",
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

const getSlotAvailabilityFromDB = async (
  cityAdConfigId?: string,
  advertisementType?: string,
  startDateStr?: string,
  endDateStr?: string,
  queryData?: {
    country?: string;
    city?: string;
    latitude?: string;
    longitude?: string;
  },
): Promise<any> => {
  let cityConfig = null;

  if (cityAdConfigId && Types.ObjectId.isValid(cityAdConfigId)) {
    cityConfig = await CityAdConfiguration.findById(cityAdConfigId);
  } else if (queryData?.country && queryData?.city) {
    cityConfig = await CityAdConfiguration.findOne({
      country: { $regex: `^${queryData.country.trim()}$`, $options: "i" },
      city: { $regex: `^${queryData.city.trim()}$`, $options: "i" },
    });
  } else if (queryData?.latitude && queryData?.longitude) {
    const lat = parseFloat(queryData.latitude);
    const lng = parseFloat(queryData.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      cityConfig = await CityAdConfiguration.findOne({
        latitude: lat,
        longitude: lng,
      });
    }
  }

  if (!cityConfig) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "City slot configuration not found",
    );
  }

  if (cityConfig.status !== SLOT_CONFIG_STATUS.ACTIVE) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "This city configuration is currently inactive.",
    );
  }

  if (advertisementType !== ADVERTISEMENT_TYPE.FEATURED) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid advertisement type");
  }

  if (!cityConfig.featuredEnabled) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Featured advertisements are currently disabled for this city.",
    );
  }

  const startDate = startDateStr ? new Date(startDateStr) : new Date();
  const endDate = endDateStr
    ? new Date(endDateStr)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const totalSlots = cityConfig.featuredCapacity;

  const { bookedSlots, overlappingAds } = await getOverlappingBookedSlots(
    cityConfig._id as Types.ObjectId,
    advertisementType,
    startDate,
    endDate,
  );

  // Return non-private minimum details about overlapping ads to let the client render bookings calendar/intervals
  const bookingsInfo = overlappingAds.map((ad) => ({
    position: ad.position,
    startDate: ad.startDate,
    endDate: ad.endDate,
  }));

  const bookedPositions = new Set(
    overlappingAds
      .filter(
        (ad) => ad.position && ad.position >= 1 && ad.position <= totalSlots,
      )
      .map((ad) => ad.position),
  );

  const availableSlots = Math.max(0, totalSlots - bookedPositions.size);

  const slots = Array.from({ length: totalSlots }, (_, i) => {
    const position = i + 1;
    const isBooked = bookedPositions.has(position);
    const bookedAd = overlappingAds.find((ad) => ad.position === position);
    const pricingObj = (cityConfig.featuredPositionPricing || []).find(
      (p) => p.position === position,
    );
    const price = pricingObj ? pricingObj.price : 0;

    return {
      position,
      slotNumber: position,
      price,
      isBooked,
      status: isBooked ? "booked" : "available",
      bookedStartDate: bookedAd?.startDate || null,
      bookedEndDate: bookedAd?.endDate || null,
    };
  });

  return {
    cityConfig: {
      _id: cityConfig._id,
      country: cityConfig.country,
      countryCode: cityConfig.countryCode,
      province: cityConfig.province || "",
      city: cityConfig.city,
      canton: cityConfig.canton || cityConfig.city,
      sector: cityConfig.sector || "",
      neighborhood: cityConfig.neighborhood || "",
      latitude: cityConfig.latitude,
      longitude: cityConfig.longitude,
      defaultFeaturedImage: cityConfig.defaultFeaturedImage || "",
    },
    advertisementType,
    totalSlots,
    bookedSlots: bookedPositions.size,
    availableSlots,
    isAvailable: availableSlots > 0,
    bookings: bookingsInfo,
    slots,
  };
};

const createAdvertisementToDB = async (
  sellerId: string,
  payload: Partial<IAdvertisement>,
): Promise<IAdvertisement> => {
  const store = await Store.findOne({ owner: sellerId });
  if (!store) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Seller store profile not found. Please create a store before booking advertisements.",
    );
  }

  if (store.status !== "active") {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      `Your store must be approved and active to create advertisements. Current status: ${store.status}`,
    );
  }

  if (!payload.cityAdConfigId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "City Slot Config ID is required",
    );
  }

  const cityAdConfigId = payload.cityAdConfigId.toString();
  const advertisementType = payload.advertisementType;
  if (!advertisementType) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Advertisement type is required",
    );
  }

  const startDate = new Date(payload.startDate!);

  // Mongoose Session for transactional lock to prevent race condition overbooking
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Acquire Lock on the City Configuration document by incrementing lockVersion inside session
    const cityConfig = await CityAdConfiguration.findOneAndUpdate(
      { _id: cityAdConfigId },
      { $inc: { lockVersion: 1 } },
      { session, new: true },
    );

    if (!cityConfig) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "City slot configuration not found",
      );
    }

    if (cityConfig.status !== SLOT_CONFIG_STATUS.ACTIVE) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "This city configuration is currently inactive.",
      );
    }

    if (advertisementType !== ADVERTISEMENT_TYPE.FEATURED) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid advertisement type");
    }

    if (!cityConfig.featuredEnabled) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "Featured advertisements are currently disabled for this city.",
      );
    }

    const totalSlots = cityConfig.featuredCapacity;
    const position = Number(payload.position);
    if (!position || isNaN(position) || position < 1 || position > totalSlots) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Invalid position: ${payload.position}. Position must be between 1 and ${totalSlots}.`,
      );
    }

    const startDate = payload.startDate ? new Date(payload.startDate) : new Date();

    // Look for a PAID transaction for this advertisement slot
    const paidTransactions = await Transaction.find({
      userId: sellerId,
      paymentStatus: "PAID",
      $or: [
        {
          "metadata.bookingType": "advertisement",
          "metadata.cityConfigId": cityConfig._id.toString(),
          "metadata.position": position,
        },
        {
          "metadata.bookingType": "advertisement",
          "metadata.cityConfigId": cityConfig._id.toString(),
        },
        {
          "metadata.cityConfigId": cityConfig._id.toString(),
          "metadata.position": position,
        },
        {
          "metadata.cityConfigId": cityConfig._id.toString(),
        },
      ],
    }).sort({ createdAt: -1 });

    let validTx: any = null;
    for (const tx of paidTransactions) {
      const alreadyUsed = await Advertisement.findOne({
        transactionId: tx._id,
        status: ADVERTISEMENT_STATUS.ACTIVE,
      });
      if (!alreadyUsed) {
        validTx = tx;
        break;
      }
    }

    // Check legacy post subscription if no direct transaction found
    let legacyPostSub: any = null;
    if (!validTx) {
      legacyPostSub = await Subscription.findOne({
        userId: sellerId,
        packageType: "post_add",
        status: { $in: ["active", "trialing"] },
        cityConfigId: cityConfig._id,
        expiresAt: { $gt: new Date() },
      }).populate("packageId");
    }

    if (!validTx && !legacyPostSub) {
      throw new ApiError(
        StatusCodes.PAYMENT_REQUIRED,
        `Payment required. Please purchase the advertisement slot for Position ${position} in ${cityConfig.city} before creating this campaign.`,
      );
    }

    let calculatedEndDate: Date;
    if (payload.endDate) {
      calculatedEndDate = new Date(payload.endDate);
    } else if (legacyPostSub?.packageId) {
      const packageInfo = legacyPostSub.packageId as any;
      calculatedEndDate = new Date(startDate);
      if (legacyPostSub.status === "trialing" && packageInfo?.trialPeriodDays) {
        calculatedEndDate.setDate(
          calculatedEndDate.getDate() + packageInfo.trialPeriodDays,
        );
      } else {
        switch (packageInfo.duration) {
          case "seven_days":
            calculatedEndDate.setDate(calculatedEndDate.getDate() + 7);
            break;
          case "one_month":
            calculatedEndDate.setMonth(calculatedEndDate.getMonth() + 1);
            break;
          case "three_month":
            calculatedEndDate.setMonth(calculatedEndDate.getMonth() + 3);
            break;
          case "six_month":
            calculatedEndDate.setMonth(calculatedEndDate.getMonth() + 6);
            break;
          case "one_year":
            calculatedEndDate.setFullYear(calculatedEndDate.getFullYear() + 1);
            break;
          default:
            calculatedEndDate.setDate(calculatedEndDate.getDate() + 7);
        }
      }
    } else {
      calculatedEndDate = new Date(startDate);
      calculatedEndDate.setDate(calculatedEndDate.getDate() + 7);
    }

    // Check if the requested position is already booked inside the session transaction
    const conflictingAd = await Advertisement.findOne({
      cityAdConfigId: cityConfig._id,
      position,
      status: ADVERTISEMENT_STATUS.ACTIVE,
      startDate: { $lte: calculatedEndDate },
      endDate: { $gte: startDate },
    }).session(session);

    if (conflictingAd) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        `Position ${position} is already booked for the selected date range. Please choose another position or different dates.`,
      );
    }

    const positionPricingObj = (cityConfig.featuredPositionPricing || []).find(
      (p) => p.position === position,
    );
    const resolvedPrice =
      validTx?.amount ??
      (positionPricingObj
        ? positionPricingObj.price
        : legacyPostSub?.packageId?.price || 0);

    const isTrial = legacyPostSub?.status === "trialing";

    // Auto-populate coordinate and location details from the trusted backend config (preventing location spoofing)
    payload.position = position;
    payload.startDate = startDate;
    payload.endDate = calculatedEndDate;
    payload.sellerId = new Types.ObjectId(sellerId);
    payload.storeId = store._id as Types.ObjectId;
    payload.country = cityConfig.country;
    payload.countryCode = cityConfig.countryCode;
    payload.province = cityConfig.province || "";
    payload.city = cityConfig.city;
    payload.canton = cityConfig.canton || cityConfig.city;
    payload.sector = cityConfig.sector || "";
    payload.neighborhood = cityConfig.neighborhood || "";
    payload.latitude = cityConfig.latitude;
    payload.longitude = cityConfig.longitude;
    payload.status = ADVERTISEMENT_STATUS.ACTIVE;
    payload.price = isTrial ? 0 : resolvedPrice;
    if (validTx) {
      payload.transactionId = validTx._id;
    }

    const [newAd] = await Advertisement.create([payload], { session });

    await session.commitTransaction();

    await sendNotifications({
      receiver: sellerId,
      title: "Advertisement Booked",
      text: `Your advertisement campaign "${newAd.campaignName}" has been successfully booked and is now active.`,
      type: NOTIFICATION_TYPE.ADVERTISEMENT_UPDATE,
      referenceId: newAd._id,
      referenceModel: "Advertisement",
    });

    return newAd!;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const getSellerAdvertisementsFromDB = async (
  sellerId: string,
  query: Record<string, unknown>,
): Promise<any> => {
  const sellerQuery = { ...query, sellerId: new Types.ObjectId(sellerId) };
  const builder = new QueryBuilder(Advertisement.find(), sellerQuery)
    .search(["campaignName", "city", "country"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery;
  const meta = await builder.countTotal();

  return { data, meta };
};

const getSellerAdvertisementDetailsFromDB = async (
  id: string,
  sellerId: string,
): Promise<IAdvertisement> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid Advertisement ID");
  }

  const result = await Advertisement.findOne({
    _id: id,
    sellerId: new Types.ObjectId(sellerId),
  });

  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Advertisement not found");
  }

  return result;
};

const cancelAdvertisementInDB = async (
  id: string,
  sellerId: string,
): Promise<IAdvertisement> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid Advertisement ID");
  }

  const ad = await Advertisement.findOne({
    _id: id,
    sellerId: new Types.ObjectId(sellerId),
  });

  if (!ad) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Advertisement not found");
  }

  if (ad.status === ADVERTISEMENT_STATUS.CANCELLED) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Advertisement is already cancelled",
    );
  }

  const result = await Advertisement.findOneAndUpdate(
    { _id: id, sellerId: new Types.ObjectId(sellerId) },
    { status: ADVERTISEMENT_STATUS.CANCELLED },
    { new: true },
  );

  if (!result) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to cancel advertisement",
    );
  }

  await sendNotifications({
    receiver: sellerId,
    title: "Advertisement Cancelled",
    text: `Your advertisement campaign "${result.campaignName}" has been cancelled.`,
    type: NOTIFICATION_TYPE.ADVERTISEMENT_UPDATE,
    referenceId: result._id,
    referenceModel: "Advertisement",
  });

  return result;
};

const updateAdvertisementInDB = async (
  id: string,
  sellerId: string,
  payload: Partial<IAdvertisement>,
): Promise<IAdvertisement> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid Advertisement ID");
  }

  const ad = await Advertisement.findOne({
    _id: id,
    sellerId: new Types.ObjectId(sellerId),
  });

  if (!ad) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Advertisement not found");
  }

  if (ad.status !== ADVERTISEMENT_STATUS.ACTIVE) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Only active advertisements can be modified. Current status: ${ad.status}`,
    );
  }

  // Prevent modifying critical booking parameters (dates, type, city configuration) to maintain capacity integrity
  const updatePayload: Record<string, any> = {};
  if (payload.campaignName) updatePayload.campaignName = payload.campaignName;
  if (payload.featuredImage)
    updatePayload.featuredImage = payload.featuredImage;

  const result = await Advertisement.findByIdAndUpdate(id, updatePayload, {
    new: true,
  });

  if (!result) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to update advertisement",
    );
  }

  return result;
};

// ----------------------------------------------------
// ADMIN DASHBOARD & BOOKINGS VIEW
// ----------------------------------------------------

const getBookingsByStatusFromDB = async (
  query: Record<string, unknown>,
): Promise<any> => {
  const { bookingType, ...restQuery } = query;
  const now = new Date();
  const filterQuery: Record<string, any> = {};

  if (bookingType === "active") {
    filterQuery.status = ADVERTISEMENT_STATUS.ACTIVE;
    filterQuery.startDate = { $lte: now };
    filterQuery.endDate = { $gte: now };
  } else if (bookingType === "upcoming") {
    filterQuery.status = ADVERTISEMENT_STATUS.ACTIVE;
    filterQuery.startDate = { $gt: now };
  } else if (bookingType === "expired") {
    filterQuery.$or = [
      { status: ADVERTISEMENT_STATUS.EXPIRED },
      { status: ADVERTISEMENT_STATUS.ACTIVE, endDate: { $lt: now } },
    ];
  }

  // Inject status filters into query builder
  const extendedQuery = { ...restQuery, ...filterQuery };

  const builder = new QueryBuilder(Advertisement.find(), extendedQuery)
    .search([
      "campaignName",
      "country",
      "province",
      "city",
      "canton",
      "sector",
      "neighborhood",
    ])
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    builder.modelQuery.populate("sellerId", "name email").lean(),
    builder.countTotal(),
  ]);

  return { data, meta };
};

const getUserAdvertisementsFromDB = async (
  userId: string,
  latitudeStr?: string,
  longitudeStr?: string,
  storeType?: string,
  cityAdConfigId?: string,
): Promise<any[]> => {
  let latitude: number | undefined;
  let longitude: number | undefined;

  if (latitudeStr && longitudeStr) {
    latitude = parseFloat(latitudeStr);
    longitude = parseFloat(longitudeStr);
  }

  // Fallback: If coordinates not provided, fetch user's location coordinates from DB
  if (
    latitude === undefined ||
    longitude === undefined ||
    isNaN(latitude) ||
    isNaN(longitude)
  ) {
    const user = await User.findById(userId);
    if (
      user &&
      user.location &&
      user.location.coordinates &&
      user.location.coordinates.length === 2
    ) {
      // GeoJSON coordinates are stored as [longitude, latitude]
      longitude = user.location.coordinates[0];
      latitude = user.location.coordinates[1];
    }
  }

  // Find all active city configurations
  const activeCities = await CityAdConfiguration.find({
    status: SLOT_CONFIG_STATUS.ACTIVE,
  });

  if (activeCities.length === 0) {
    return [];
  }

  const hasValidCoordinates =
    latitude !== undefined &&
    longitude !== undefined &&
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    !(latitude === 0 && longitude === 0);

  let targetCity = null;

  if (cityAdConfigId && Types.ObjectId.isValid(cityAdConfigId)) {
    targetCity = activeCities.find((c) => c._id.toString() === cityAdConfigId);
  }

  if (!targetCity && hasValidCoordinates) {
    // Haversine formula helper
    const getDistance = (
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number,
    ) => {
      const R = 6371; // Earth's radius in km
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    let closestCity = activeCities[0];
    let minDistance = getDistance(
      latitude!,
      longitude!,
      closestCity.latitude,
      closestCity.longitude,
    );

    for (let i = 1; i < activeCities.length; i++) {
      const city = activeCities[i];
      const dist = getDistance(
        latitude!,
        longitude!,
        city.latitude,
        city.longitude,
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestCity = city;
      }
    }
    targetCity = closestCity;
  }

  if (!targetCity) {
    // Default to the first active city with featuredEnabled
    targetCity = activeCities.find((c) => c.featuredEnabled) || activeCities[0];
  }

  if (!targetCity || !targetCity.featuredEnabled) {
    return [];
  }

  const now = new Date();
  let advertisements = await Advertisement.find({
    cityAdConfigId: targetCity._id,
    advertisementType: ADVERTISEMENT_TYPE.FEATURED,
    status: ADVERTISEMENT_STATUS.ACTIVE,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).populate({
    path: "storeId",
    match: storeType ? { storeType } : {},
  });

  if (storeType) {
    advertisements = advertisements.filter((ad) => ad.storeId !== null);
  }

  const capacity = targetCity.featuredCapacity || 0;
  const defaultImage = targetCity.defaultFeaturedImage || "";

  const slots: any[] = [];
  for (let pos = 1; pos <= capacity; pos++) {
    const adForPos = advertisements.find((ad) => ad.position === pos);
    if (adForPos) {
      const adObj = adForPos.toObject ? adForPos.toObject() : adForPos;
      slots.push({
        ...adObj,
        position: pos,
        isBooked: true,
        isDefault: false,
        image: adForPos.featuredImage || "",
        advertisement: adObj,
      });
    } else {
      slots.push({
        _id: null,
        position: pos,
        isBooked: false,
        isDefault: true,
        campaignName: "Available Slot",
        featuredImage: defaultImage,
        image: defaultImage,
        defaultImage: defaultImage,
        cityAdConfigId: targetCity._id,
        country: targetCity.country,
        countryCode: targetCity.countryCode,
        province: targetCity.province || "",
        city: targetCity.city,
        canton: targetCity.canton || targetCity.city,
        sector: targetCity.sector || "",
        neighborhood: targetCity.neighborhood || "",
        latitude: targetCity.latitude,
        longitude: targetCity.longitude,
        status: ADVERTISEMENT_STATUS.ACTIVE,
        advertisement: null,
      });
    }
  }

  return slots;
};

const getAdvertisementPaymentsFromDB = async (
  query: Record<string, unknown>,
): Promise<any> => {
  const {
    searchTerm,
    city,
    cityAdConfigId,
    position,
    status,
    startDate,
    endDate,
    packageId,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;

  const baseFilter: Record<string, any> = {
    packageType: "post_add",
  };

  // 1. Status Filter
  if (status && status !== "all") {
    baseFilter.status = status;
  }

  // 2. City Filter
  if (cityAdConfigId && Types.ObjectId.isValid(cityAdConfigId as string)) {
    baseFilter.cityConfigId = new Types.ObjectId(cityAdConfigId as string);
  } else if (city && typeof city === "string" && city.trim() !== "") {
    const matchingCities = await CityAdConfiguration.find({
      city: { $regex: city.trim(), $options: "i" },
    }).select("_id");
    const cityIds = matchingCities.map((c) => c._id);
    baseFilter.cityConfigId = { $in: cityIds };
  }

  // 3. Position Filter
  if (position !== undefined && position !== null && position !== "") {
    const posNum = Number(position);
    if (!isNaN(posNum)) {
      baseFilter.position = posNum;
    }
  }

  // 4. Package Filter
  if (packageId && Types.ObjectId.isValid(packageId as string)) {
    baseFilter.packageId = new Types.ObjectId(packageId as string);
  }

  // 5. Payment Date Range (createdAt)
  if (startDate || endDate) {
    baseFilter.createdAt = {};
    if (startDate) {
      baseFilter.createdAt.$gte = new Date(startDate as string);
    }
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      baseFilter.createdAt.$lte = end;
    }
  }

  // 6. Search Term (search user name, email, store displayName, trxId, package name, city name)
  if (searchTerm && typeof searchTerm === "string" && searchTerm.trim() !== "") {
    const searchRegex = new RegExp(searchTerm.trim(), "i");

    const [matchingUsers, matchingStores, matchingCities, matchingPackages, matchingAds] =
      await Promise.all([
        User.find({
          $or: [
            { name: { $regex: searchRegex } },
            { email: { $regex: searchRegex } },
          ],
        })
          .select("_id")
          .lean(),
        Store.find({
          displayName: { $regex: searchRegex },
        })
          .select("owner")
          .lean(),
        CityAdConfiguration.find({
          $or: [
            { city: { $regex: searchRegex } },
            { canton: { $regex: searchRegex } },
            { sector: { $regex: searchRegex } },
            { neighborhood: { $regex: searchRegex } },
            { province: { $regex: searchRegex } },
            { country: { $regex: searchRegex } },
          ],
        })
          .select("_id")
          .lean(),
        SubscriptionPackage.find({
          name: { $regex: searchRegex },
        })
          .select("_id")
          .lean(),
        Advertisement.find({
          campaignName: { $regex: searchRegex },
        })
          .select("sellerId")
          .lean(),
      ]);

    const userIds = matchingUsers.map((u: any) => u._id);
    const storeOwnerIds = matchingStores.map((s: any) => s.owner);
    const cityIds = matchingCities.map((c: any) => c._id);
    const packageIds = matchingPackages.map((p: any) => p._id);
    const adSellerIds = matchingAds.map((a: any) => a.sellerId);

    const combinedUserIds = [
      ...new Set([...userIds, ...storeOwnerIds, ...adSellerIds]),
    ];

    baseFilter.$or = [
      { trxId: { $regex: searchRegex } },
      { checkoutSessionId: { $regex: searchRegex } },
      { userId: { $in: combinedUserIds } },
      { cityConfigId: { $in: cityIds } },
      { packageId: { $in: packageIds } },
    ];
  }

  // Pagination & Sorting
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;
  const sortDirection = sortOrder === "asc" ? 1 : -1;
  const sortObj: Record<string, 1 | -1> = { [sortBy as string]: sortDirection };

  const now = new Date();

  // Run paginated find, total count, and summary statistics concurrently
  const [
    total,
    subscriptions,
    totalRevenueAgg,
    activeAdsCount,
    trialCount,
  ] = await Promise.all([
    Subscription.countDocuments(baseFilter),
    Subscription.find(baseFilter)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .populate("userId", "name email phone profileImage")
      .populate("packageId", "name duration price trialPeriodDays packageType")
      .populate(
        "cityConfigId",
        "city country countryCode latitude longitude defaultFeaturedImage featuredCapacity",
      )
      .lean(),
    Subscription.aggregate([
      { $match: { packageType: "post_add", amountPaid: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]),
    Subscription.countDocuments({
      packageType: "post_add",
      status: "active",
      expiresAt: { $gt: now },
    }),
    Subscription.countDocuments({
      packageType: "post_add",
      status: "trialing",
    }),
  ]);

  const totalPage = Math.ceil(total / limitNum);
  const totalRevenue =
    totalRevenueAgg.length > 0
      ? Math.round(totalRevenueAgg[0].total * 100) / 100
      : 0;

  // Batch fetch all related Stores, Ads, and Transactions for the items on this page
  const sellerIds = [
    ...new Set(
      subscriptions
        .map((s: any) => s.userId?._id?.toString() || s.userId?.toString())
        .filter(Boolean),
    ),
  ];

  const trxIds = [
    ...new Set(subscriptions.map((s: any) => s.trxId).filter(Boolean)),
  ];
  const sessionIds = [
    ...new Set(subscriptions.map((s: any) => s.checkoutSessionId).filter(Boolean)),
  ];

  const txConditions: any[] = [];
  if (trxIds.length > 0) {
    txConditions.push({ gatewayTransactionId: { $in: trxIds } });
  }
  if (sessionIds.length > 0) {
    txConditions.push({ checkoutSessionId: { $in: sessionIds } });
  }

  const [stores, ads, transactions] = await Promise.all([
    sellerIds.length > 0
      ? Store.find({ owner: { $in: sellerIds } })
        .select(
          "displayName logo storeType phone email address streetAddress owner",
        )
        .lean()
      : [],
    sellerIds.length > 0
      ? Advertisement.find({
        sellerId: { $in: sellerIds },
        isDeleted: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .lean()
      : [],
    txConditions.length > 0
      ? Transaction.find({ $or: txConditions })
        .select(
          "transactionId paymentMethod paymentStatus amount createdAt gatewayTransactionId checkoutSessionId",
        )
        .lean()
      : [],
  ]);

  // Index stores in a Map
  const storeMap = new Map<string, any>(
    stores.map((s: any) => [s.owner.toString(), s]),
  );

  // Group ads by sellerId
  const adsBySeller = new Map<string, any[]>();
  for (const ad of ads) {
    const sId = (ad as any).sellerId.toString();
    if (!adsBySeller.has(sId)) {
      adsBySeller.set(sId, []);
    }
    adsBySeller.get(sId)!.push(ad);
  }

  // Index transactions by identifier
  const txMap = new Map<string, any>();
  for (const tx of transactions) {
    const txObj = tx as any;
    if (txObj.gatewayTransactionId) txMap.set(txObj.gatewayTransactionId, txObj);
    if (txObj.checkoutSessionId) txMap.set(txObj.checkoutSessionId, txObj);
  }

  // Synchronously enrich each subscription record in memory
  const enrichedData = subscriptions.map((sub: any) => {
    const subObj = sub;
    const seller = sub.userId;
    const cityConfig = sub.cityConfigId;
    const pkg = sub.packageId;
    const sellerIdStr = seller?._id?.toString() || seller?.toString() || "";

    // 1. Store lookup
    const store = sellerIdStr ? storeMap.get(sellerIdStr) || null : null;

    // 2. Corresponding Advertisement campaign lookup
    let ad = null;
    if (sellerIdStr && adsBySeller.has(sellerIdStr)) {
      const sellerAds = adsBySeller.get(sellerIdStr)!;
      ad =
        sellerAds.find((candidate) => {
          if (
            cityConfig?._id &&
            candidate.cityAdConfigId?.toString() !== cityConfig._id.toString()
          ) {
            return false;
          }
          if (sub.position && candidate.position !== sub.position) {
            return false;
          }
          return true;
        }) || null;
    }

    // 3. Transaction lookup (for invoice number, payment method)
    let transaction = null;
    if (sub.trxId && txMap.has(sub.trxId)) {
      transaction = txMap.get(sub.trxId);
    } else if (sub.checkoutSessionId && txMap.has(sub.checkoutSessionId)) {
      transaction = txMap.get(sub.checkoutSessionId);
    }

    // Calculate days remaining & expiry
    const isExpired = subObj.expiresAt
      ? new Date(subObj.expiresAt) <= now
      : false;
    const diffMs = subObj.expiresAt
      ? new Date(subObj.expiresAt).getTime() - now.getTime()
      : 0;
    const remainingDays =
      diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;

    // Resolved position: from subscription or from linked advertisement
    const position = subObj.position || ad?.position || null;

    // Resolved amount: from subscription amountPaid, transaction amount, or package price
    const amountPaid =
      typeof subObj.amountPaid === "number"
        ? subObj.amountPaid
        : transaction?.amount ||
        (subObj.status === "trialing" ? 0 : pkg?.price || 0);

    const invoiceNumber =
      transaction?.transactionId || subObj.invoiceNumber || null;
    const safeInvoice = invoiceNumber
      ? invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")
      : null;
    const invoiceUrl =
      transaction?.invoiceUrl ||
      subObj.invoiceUrl ||
      (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
    const invoiceDownloadUrl = safeInvoice
      ? `/api/v1/invoices/download/${safeInvoice}`
      : subObj._id
        ? `/api/v1/invoices/download/${subObj._id}`
        : null;

    let paymentMethod: string = PAYMENT_METHOD.DATAFAST;
    if (transaction?.paymentMethod) {
      paymentMethod = transaction.paymentMethod;
    } else if (subObj.status === "trialing") {
      paymentMethod = "Free Trial";
    }

    const paymentStatus =
      transaction?.paymentStatus ||
      (subObj.status === "trialing" ? "TRIAL" : "PAID");

    return {
      id: subObj._id,
      subscriptionId: subObj._id,
      seller: seller
        ? {
          id: seller._id,
          name: seller.name,
          email: seller.email,
          phone: seller.phone || null,
          profileImage: seller.profileImage || null,
        }
        : null,
      store: store
        ? {
          id: store._id,
          displayName: store.displayName || null,
          logo: store.logo || null,
          storeType: store.storeType || null,
          phone: store.phone || null,
          email: store.email || null,
        }
        : null,
      city: cityConfig
        ? {
          id: cityConfig._id,
          name: cityConfig.city,
          country: cityConfig.country,
          countryCode: cityConfig.countryCode,
          latitude: cityConfig.latitude,
          longitude: cityConfig.longitude,
        }
        : ad
          ? {
            id: ad.cityAdConfigId,
            name: ad.city,
            country: ad.country,
            countryCode: ad.countryCode,
            latitude: ad.latitude,
            longitude: ad.longitude,
          }
          : null,
      position,
      amountPaid,
      trxId: subObj.trxId || null,
      checkoutSessionId: subObj.checkoutSessionId || null,
      invoiceNumber,
      invoiceUrl,
      invoiceDownloadUrl,
      paymentMethod,
      paymentStatus,
      paymentDate: subObj.createdAt,
      isTrial:
        subObj.status === "trialing" || subObj.trxId === "trial_activated",
      package: pkg
        ? {
          id: pkg._id,
          name: pkg.name,
          duration: pkg.duration,
          price: pkg.price,
        }
        : null,
      subscription: {
        status: subObj.status,
        expiresAt: subObj.expiresAt,
        remainingDays,
        isExpired,
      },
      advertisement: ad
        ? {
          id: ad._id,
          campaignName: ad.campaignName,
          featuredImage: ad.featuredImage || null,
          status: ad.status,
          startDate: ad.startDate,
          endDate: ad.endDate,
          price: ad.price,
        }
        : null,
      isAdSubmitted: Boolean(ad),
    };
  });

  const pagination = {
    page: pageNum,
    limit: limitNum,
    total,
    totalPage,
    hasNextPage: pageNum < totalPage,
    hasPrevPage: pageNum > 1,
  };

  const meta = {
    ...pagination,
    totalPayments: total,
    totalRevenue,
    activeAdsCount,
    trialCount,
  };

  return {
    data: enrichedData,
    meta,
    pagination,
  };
};

const getSingleAdvertisementPaymentFromDB = async (
  id: string,
): Promise<any> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID format");
  }

  const sub = await Subscription.findOne({
    _id: id,
    packageType: "post_add",
  })
    .populate("userId", "name email phone profileImage")
    .populate("packageId", "name duration price trialPeriodDays packageType")
    .populate(
      "cityConfigId",
      "city country countryCode latitude longitude defaultFeaturedImage featuredCapacity",
    );

  if (!sub) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Advertisement payment record not found",
    );
  }

  const now = new Date();
  const subObj = sub.toObject();
  const seller = sub.userId as any;
  const cityConfig = sub.cityConfigId as any;
  const pkg = sub.packageId as any;

  const store = seller?._id
    ? await Store.findOne({ owner: seller._id }).select(
      "displayName logo storeType phone email address streetAddress",
    )
    : null;

  const adQuery: Record<string, any> = {
    sellerId: seller?._id,
    isDeleted: { $ne: true },
  };
  if (cityConfig?._id) {
    adQuery.cityAdConfigId = cityConfig._id;
  }
  if (sub.position) {
    adQuery.position = sub.position;
  }

  const ad = await Advertisement.findOne(adQuery).sort({ createdAt: -1 });

  let transaction = null;
  if (sub.trxId || sub.checkoutSessionId) {
    const txQueries: any[] = [];
    if (sub.trxId) {
      txQueries.push({ gatewayTransactionId: sub.trxId });
    }
    if (sub.checkoutSessionId) {
      txQueries.push({ checkoutSessionId: sub.checkoutSessionId });
    }
    if (txQueries.length > 0) {
      transaction = await Transaction.findOne({ $or: txQueries }).select(
        "transactionId paymentMethod paymentStatus amount createdAt",
      );
    }
  }

  const isExpired = subObj.expiresAt
    ? new Date(subObj.expiresAt) <= now
    : false;
  const diffMs = subObj.expiresAt
    ? new Date(subObj.expiresAt).getTime() - now.getTime()
    : 0;
  const remainingDays =
    diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;

  const position = subObj.position || ad?.position || null;
  const amountPaid =
    typeof subObj.amountPaid === "number"
      ? subObj.amountPaid
      : transaction?.amount ||
      (subObj.status === "trialing" ? 0 : pkg?.price || 0);

  const invoiceNumber = transaction?.transactionId || subObj.invoiceNumber || null;
  const safeInvoice = invoiceNumber ? invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_") : null;
  const invoiceUrl = transaction?.invoiceUrl || subObj.invoiceUrl || (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
  const invoiceDownloadUrl = safeInvoice
    ? `/api/v1/invoices/download/${safeInvoice}`
    : subObj._id
      ? `/api/v1/invoices/download/${subObj._id}`
      : null;

  let paymentMethod: string = PAYMENT_METHOD.DATAFAST;
  if (transaction?.paymentMethod) {
    paymentMethod = transaction.paymentMethod;
  } else if (subObj.status === "trialing") {
    paymentMethod = "Free Trial";
  }

  const paymentStatus =
    transaction?.paymentStatus ||
    (subObj.status === "trialing" ? "TRIAL" : "PAID");

  return {
    id: subObj._id,
    subscriptionId: subObj._id,
    seller: seller
      ? {
        id: seller._id,
        name: seller.name,
        email: seller.email,
        phone: seller.phone || null,
        profileImage: seller.profileImage || null,
      }
      : null,
    store: store
      ? {
        id: store._id,
        displayName: store.displayName || null,
        logo: store.logo || null,
        storeType: store.storeType || null,
        phone: store.phone || null,
        email: store.email || null,
        address: store.streetAddress || null,
      }
      : null,
    city: cityConfig
      ? {
        id: cityConfig._id,
        name: cityConfig.city,
        country: cityConfig.country,
        countryCode: cityConfig.countryCode,
        latitude: cityConfig.latitude,
        longitude: cityConfig.longitude,
      }
      : ad
        ? {
          id: ad.cityAdConfigId,
          name: ad.city,
          country: ad.country,
          countryCode: ad.countryCode,
          latitude: ad.latitude,
          longitude: ad.longitude,
        }
        : null,
    position,
    amountPaid,
    trxId: subObj.trxId || null,
    checkoutSessionId: subObj.checkoutSessionId || null,
    invoiceNumber,
    invoiceUrl,
    invoiceDownloadUrl,
    paymentMethod,
    paymentStatus,
    paymentDate: subObj.createdAt,
    isTrial:
      subObj.status === "trialing" || subObj.trxId === "trial_activated",
    package: pkg
      ? {
        id: pkg._id,
        name: pkg.name,
        duration: pkg.duration,
        price: pkg.price,
      }
      : null,
    subscription: {
      status: subObj.status,
      expiresAt: subObj.expiresAt,
      remainingDays,
      isExpired,
    },
    advertisement: ad
      ? {
        id: ad._id,
        campaignName: ad.campaignName,
        featuredImage: ad.featuredImage || null,
        status: ad.status,
        startDate: ad.startDate,
        endDate: ad.endDate,
        price: ad.price,
      }
      : null,
    isAdSubmitted: Boolean(ad),
  };
};

export const AdvertisementService = {
  verifySellerForPostingInDB,
  getSlotAvailabilityFromDB,
  createAdvertisementToDB,
  getSellerAdvertisementsFromDB,
  getSellerAdvertisementDetailsFromDB,
  cancelAdvertisementInDB,
  updateAdvertisementInDB,
  getBookingsByStatusFromDB,
  getUserAdvertisementsFromDB,
  getAdvertisementPaymentsFromDB,
  getSingleAdvertisementPaymentFromDB,
};
