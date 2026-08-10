import mongoose, { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { SLOT_CONFIG_STATUS } from "./cityAdConfiguration.constant";
import { ICityAdConfiguration } from "./cityAdConfiguration.interface";
import { CityAdConfiguration } from "./cityAdConfiguration.model";
import { getOverlappingBookedSlots } from "../advertisement/advertisement.service";
import {
  ADVERTISEMENT_TYPE,
  ADVERTISEMENT_STATUS,
} from "../advertisement/advertisement.constant";
import { Advertisement } from "../advertisement/advertisement.model";

const createCityAdConfigToDB = async (
  payload: ICityAdConfiguration,
): Promise<ICityAdConfiguration> => {
  // Normalize names
  payload.city = payload.city.trim();
  payload.country = payload.country.trim();

  // Unique check
  const exists = await CityAdConfiguration.findOne({
    country: { $regex: `^${payload.country}$`, $options: "i" },
    city: { $regex: `^${payload.city}$`, $options: "i" },
  });

  if (exists) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      `A city configuration for "${payload.city}, ${payload.country}" already exists.`,
    );
  }

  return await CityAdConfiguration.create(payload);
};

const getCityAdConfigsFromDB = async (
  query: Record<string, unknown>,
): Promise<any> => {
  const cityConfigsQuery = new QueryBuilder(CityAdConfiguration.find(), query)
    .search(["country", "city"])
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await cityConfigsQuery.modelQuery;
  const meta = await cityConfigsQuery.countTotal();

  return { data, meta };
};

const getSingleCityConfigFromDB = async (
  id: string,
): Promise<ICityAdConfiguration> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid Configuration ID");
  }

  const result = await CityAdConfiguration.findById(id);
  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "City configuration not found");
  }

  return result;
};

const updateCityAdConfigInDB = async (
  id: string,
  payload: Partial<ICityAdConfiguration>,
): Promise<ICityAdConfiguration> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid Configuration ID");
  }

  const configDoc = await CityAdConfiguration.findById(id);
  if (!configDoc) {
    throw new ApiError(StatusCodes.NOT_FOUND, "City configuration not found");
  }

  if (payload.city || payload.country) {
    const city = (payload.city || configDoc.city).trim();
    const country = (payload.country || configDoc.country).trim();

    const exists = await CityAdConfiguration.findOne({
      _id: { $ne: id },
      country: { $regex: `^${country}$`, $options: "i" },
      city: { $regex: `^${city}$`, $options: "i" },
    });

    if (exists) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        `Another configuration for "${city}, ${country}" already exists.`,
      );
    }
    payload.city = city;
    payload.country = country;
  }

  const result = await CityAdConfiguration.findByIdAndUpdate(id, payload, {
    new: true,
  });

  if (!result) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "City configuration update failed",
    );
  }

  return result;
};

const toggleCityAdConfigInDB = async (
  id: string,
  adType: "banner" | "featured",
  enabled: boolean,
): Promise<ICityAdConfiguration> => {
  const updateField =
    adType === "banner"
      ? { bannerEnabled: enabled }
      : { featuredEnabled: enabled };
  return await updateCityAdConfigInDB(id, updateField);
};

const updateCityAdCapacityInDB = async (
  id: string,
  adType: "banner" | "featured",
  capacity: number,
): Promise<ICityAdConfiguration> => {
  const updateField =
    adType === "banner"
      ? { bannerCapacity: capacity }
      : { featuredCapacity: capacity };
  return await updateCityAdConfigInDB(id, updateField);
};

const getSellerActiveCitiesFromDB = async (): Promise<
  ICityAdConfiguration[]
> => {
  return await CityAdConfiguration.find({ status: SLOT_CONFIG_STATUS.ACTIVE });
};

const getCityWiseAvailabilitySummaryFromDB = async (
  startDateStr?: string,
  endDateStr?: string,
): Promise<any[]> => {
  const cities = await CityAdConfiguration.find({
    status: SLOT_CONFIG_STATUS.ACTIVE,
  });

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const startDate = startDateStr ? new Date(startDateStr) : today;
  const endDate = endDateStr ? new Date(endDateStr) : tomorrow;

  const summary = [];

  for (const city of cities) {
    // Banner summary
    const bannerTotal = city.bannerCapacity;
    const bannerBookedObj = await getOverlappingBookedSlots(
      city._id as Types.ObjectId,
      ADVERTISEMENT_TYPE.BANNER,
      startDate,
      endDate,
    );
    const bannerBooked = bannerBookedObj.bookedSlots;
    const bannerAvailable = Math.max(0, bannerTotal - bannerBooked);

    // Featured summary
    const featuredTotal = city.featuredCapacity;
    const featuredBookedObj = await getOverlappingBookedSlots(
      city._id as Types.ObjectId,
      ADVERTISEMENT_TYPE.FEATURED,
      startDate,
      endDate,
    );
    const featuredBooked = featuredBookedObj.bookedSlots;
    const featuredAvailable = Math.max(0, featuredTotal - featuredBooked);

    summary.push({
      cityConfig: {
        _id: city._id,
        country: city.country,
        countryCode: city.countryCode,
        city: city.city,
        latitude: city.latitude,
        longitude: city.longitude,
        status: city.status,
      },
      banner: {
        total: bannerTotal,
        booked: bannerBooked,
        available: bannerAvailable,
        enabled: city.bannerEnabled,
      },
      featured: {
        total: featuredTotal,
        booked: featuredBooked,
        available: featuredAvailable,
        enabled: city.featuredEnabled,
      },
    });
  }

  return summary;
};

const getCityBookingStatisticsFromDB = async (
  cityAdConfigId: string,
): Promise<any> => {
  if (!Types.ObjectId.isValid(cityAdConfigId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid City Slot Config ID");
  }

  const config = await CityAdConfiguration.findById(cityAdConfigId);
  if (!config) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "City slot configuration not found",
    );
  }

  const now = new Date();

  // Active bookings (status ACTIVE and end date not passed)
  const activeCount = await Advertisement.countDocuments({
    cityAdConfigId: config._id,
    status: ADVERTISEMENT_STATUS.ACTIVE,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  // Upcoming bookings (status ACTIVE and start date in the future)
  const upcomingCount = await Advertisement.countDocuments({
    cityAdConfigId: config._id,
    status: ADVERTISEMENT_STATUS.ACTIVE,
    startDate: { $gt: now },
  });

  // Expired bookings (status EXPIRED or status ACTIVE and end date in the past)
  const expiredCount = await Advertisement.countDocuments({
    cityAdConfigId: config._id,
    $or: [
      { status: ADVERTISEMENT_STATUS.EXPIRED },
      { status: ADVERTISEMENT_STATUS.ACTIVE, endDate: { $lt: now } },
    ],
  });

  // Cancelled bookings
  const cancelledCount = await Advertisement.countDocuments({
    cityAdConfigId: config._id,
    status: ADVERTISEMENT_STATUS.CANCELLED,
  });

  return {
    cityConfig: {
      _id: config._id,
      city: config.city,
      country: config.country,
    },
    statistics: {
      active: activeCount,
      upcoming: upcomingCount,
      expired: expiredCount,
      cancelled: cancelledCount,
      totalBookings:
        activeCount + upcomingCount + expiredCount + cancelledCount,
    },
  };
};

export const CityAdConfigurationService = {
  createCityAdConfigToDB,
  getCityAdConfigsFromDB,
  getSingleCityConfigFromDB,
  updateCityAdConfigInDB,
  toggleCityAdConfigInDB,
  updateCityAdCapacityInDB,
  getSellerActiveCitiesFromDB,
  getCityWiseAvailabilitySummaryFromDB,
  getCityBookingStatisticsFromDB,
};
