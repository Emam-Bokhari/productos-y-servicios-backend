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
import { ICityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.interface";
import { CityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.model";
import { Advertisement } from "./advertisement.model";
import { Store } from "../store/store.model";
import { User } from "../user/user.model";
import QueryBuilder from "../../builder/queryBuilder";

// Helper to calculate maximum concurrent bookings for a given date range
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
    currentRole: "seller",
    action: "switched_and_proceed",
    message: "Successfully switched active role to seller.",
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

const getSlotAvailabilityFromDB = async (
  cityAdConfigId: string,
  advertisementType: string,
  startDateStr: string,
  endDateStr: string,
): Promise<any> => {
  if (!Types.ObjectId.isValid(cityAdConfigId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid City Slot Config ID");
  }

  const cityConfig = await CityAdConfiguration.findById(cityAdConfigId);
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

  if (advertisementType === ADVERTISEMENT_TYPE.BANNER) {
    if (!cityConfig.bannerEnabled) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "Banner advertisements are currently disabled for this city.",
      );
    }
  } else if (advertisementType === ADVERTISEMENT_TYPE.FEATURED) {
    if (!cityConfig.featuredEnabled) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "Featured advertisements are currently disabled for this city.",
      );
    }
  } else {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid advertisement type");
  }

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  const totalSlots =
    advertisementType === ADVERTISEMENT_TYPE.BANNER
      ? cityConfig.bannerCapacity
      : cityConfig.featuredCapacity;

  const { bookedSlots, overlappingAds } = await getOverlappingBookedSlots(
    cityConfig._id as Types.ObjectId,
    advertisementType,
    startDate,
    endDate,
  );

  const availableSlots = Math.max(0, totalSlots - bookedSlots);

  // Return non-private minimum details about overlapping ads to let the client render bookings calendar/intervals
  const bookingsInfo = overlappingAds.map((ad) => ({
    startDate: ad.startDate,
    endDate: ad.endDate,
  }));

  const slots = Array.from({ length: totalSlots }, (_, i) => {
    const slotNumber = i + 1;
    const isBooked = slotNumber <= bookedSlots;
    return {
      slotNumber,
      isBooked,
      status: isBooked ? "booked" : "available",
    };
  });

  return {
    cityConfig: {
      _id: cityConfig._id,
      country: cityConfig.country,
      city: cityConfig.city,
      latitude: cityConfig.latitude,
      longitude: cityConfig.longitude,
    },
    totalSlots,
    bookedSlots,
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
  const endDate = new Date(payload.endDate!);

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

    // Verify type is enabled
    if (advertisementType === ADVERTISEMENT_TYPE.BANNER) {
      if (!cityConfig.bannerEnabled) {
        throw new ApiError(
          StatusCodes.FORBIDDEN,
          "Banner advertisements are currently disabled for this city.",
        );
      }
    } else if (advertisementType === ADVERTISEMENT_TYPE.FEATURED) {
      if (!cityConfig.featuredEnabled) {
        throw new ApiError(
          StatusCodes.FORBIDDEN,
          "Featured advertisements are currently disabled for this city.",
        );
      }
    }

    const totalSlots =
      advertisementType === ADVERTISEMENT_TYPE.BANNER
        ? cityConfig.bannerCapacity
        : cityConfig.featuredCapacity;

    // Check booked slots inside the session transaction
    const { bookedSlots } = await getOverlappingBookedSlots(
      cityConfig._id as Types.ObjectId,
      advertisementType,
      startDate,
      endDate,
      session,
    );

    if (bookedSlots >= totalSlots) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        "No slots available for the requested date range. Slot capacity has been fully booked.",
      );
    }

    // Auto-populate coordinate and location details from the trusted backend config (preventing location spoofing)
    payload.sellerId = new Types.ObjectId(sellerId);
    payload.storeId = store._id as Types.ObjectId;
    payload.country = cityConfig.country;
    payload.countryCode = cityConfig.countryCode;
    payload.city = cityConfig.city;
    payload.latitude = cityConfig.latitude;
    payload.longitude = cityConfig.longitude;
    payload.status = ADVERTISEMENT_STATUS.ACTIVE;

    const [newAd] = await Advertisement.create([payload], { session });

    await session.commitTransaction();
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
  if (payload.bannerImage) updatePayload.bannerImage = payload.bannerImage;
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
    .search(["campaignName", "city", "country"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery.populate("sellerId", "name email");
  const meta = await builder.countTotal();

  return { data, meta };
};

const getUserAdvertisementsFromDB = async (
  userId: string,
  latitudeStr?: string,
  longitudeStr?: string,
): Promise<{ banners: IAdvertisement[]; featured: IAdvertisement[] }> => {
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

  if (
    latitude === undefined ||
    longitude === undefined ||
    isNaN(latitude) ||
    isNaN(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "User location coordinates (latitude and longitude) are required to show advertisements.",
    );
  }

  // Find all active city configurations
  const activeCities = await CityAdConfiguration.find({
    status: SLOT_CONFIG_STATUS.ACTIVE,
  });
  if (activeCities.length === 0) {
    return { banners: [], featured: [] };
  }

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

  // Find closest city config
  let closestCity = activeCities[0];
  let minDistance = getDistance(
    latitude,
    longitude,
    closestCity.latitude,
    closestCity.longitude,
  );

  for (let i = 1; i < activeCities.length; i++) {
    const city = activeCities[i];
    const dist = getDistance(
      latitude,
      longitude,
      city.latitude,
      city.longitude,
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestCity = city;
    }
  }

  const now = new Date();
  const advertisements = await Advertisement.find({
    cityAdConfigId: closestCity._id,
    status: ADVERTISEMENT_STATUS.ACTIVE,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).populate("storeId");

  const banners = advertisements.filter(
    (ad) =>
      ad.advertisementType === ADVERTISEMENT_TYPE.BANNER &&
      closestCity.bannerEnabled,
  );
  const featured = advertisements.filter(
    (ad) =>
      ad.advertisementType === ADVERTISEMENT_TYPE.FEATURED &&
      closestCity.featuredEnabled,
  );

  return { banners, featured };
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
};
