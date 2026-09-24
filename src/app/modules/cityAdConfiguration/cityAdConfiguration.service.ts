import { Types } from "mongoose";
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
import unlinkFile from "../../../shared/unlinkFile";

const createCityAdConfigToDB = async (
  payload: ICityAdConfiguration,
): Promise<ICityAdConfiguration> => {
  // Normalize names
  payload.country = payload.country.trim();
  payload.countryCode = payload.countryCode.trim();
  payload.province = (payload.province || "").trim();
  payload.city = payload.city.trim();
  payload.canton = (payload.canton || payload.city).trim();
  payload.sector = (payload.sector || "").trim();
  payload.neighborhood = (payload.neighborhood || "").trim();

  // Unique check for exact location hierarchy: COUNTRY > PROVINCE > CITY/CANTON > SECTOR > NEIGHBORHOOD
  const exists = await CityAdConfiguration.findOne({
    country: { $regex: `^${payload.country}$`, $options: "i" },
    province: { $regex: `^${payload.province}$`, $options: "i" },
    $or: [
      { city: { $regex: `^${payload.city}$`, $options: "i" } },
      { canton: { $regex: `^${payload.canton}$`, $options: "i" } },
    ],
    sector: { $regex: `^${payload.sector}$`, $options: "i" },
    neighborhood: { $regex: `^${payload.neighborhood}$`, $options: "i" },
  });

  if (exists) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      `A location configuration for "${payload.neighborhood}, ${payload.sector}, ${payload.city}, ${payload.province}, ${payload.country}" already exists.`,
    );
  }

  return await CityAdConfiguration.create(payload);
};

const getCityAdConfigsFromDB = async (
  query: Record<string, unknown>,
): Promise<any> => {
  const cityConfigsQuery = new QueryBuilder(CityAdConfiguration.find(), query)
    .search([
      "country",
      "countryCode",
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

  if (
    payload.city ||
    payload.country ||
    payload.province ||
    payload.canton ||
    payload.sector ||
    payload.neighborhood
  ) {
    const country = (payload.country || configDoc.country).trim();
    const province = (
      payload.province !== undefined ? payload.province : configDoc.province || ""
    ).trim();
    const city = (payload.city || configDoc.city).trim();
    const canton = (payload.canton || configDoc.canton || city).trim();
    const sector = (
      payload.sector !== undefined ? payload.sector : configDoc.sector || ""
    ).trim();
    const neighborhood = (
      payload.neighborhood !== undefined
        ? payload.neighborhood
        : configDoc.neighborhood || ""
    ).trim();

    const exists = await CityAdConfiguration.findOne({
      _id: { $ne: id },
      country: { $regex: `^${country}$`, $options: "i" },
      province: { $regex: `^${province}$`, $options: "i" },
      $or: [
        { city: { $regex: `^${city}$`, $options: "i" } },
        { canton: { $regex: `^${canton}$`, $options: "i" } },
      ],
      sector: { $regex: `^${sector}$`, $options: "i" },
      neighborhood: { $regex: `^${neighborhood}$`, $options: "i" },
    });

    if (exists) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        `Another configuration for "${neighborhood}, ${sector}, ${city}, ${province}, ${country}" already exists.`,
      );
    }
    payload.country = country;
    payload.province = province;
    payload.city = city;
    payload.canton = canton;
    payload.sector = sector;
    payload.neighborhood = neighborhood;
  }

  if (
    payload.defaultFeaturedImage &&
    configDoc.defaultFeaturedImage &&
    payload.defaultFeaturedImage !== configDoc.defaultFeaturedImage
  ) {
    unlinkFile(configDoc.defaultFeaturedImage);
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
  adType: "featured",
  enabled: boolean,
): Promise<ICityAdConfiguration> => {
  return await updateCityAdConfigInDB(id, { featuredEnabled: enabled });
};

const updateCityAdCapacityInDB = async (
  id: string,
  adType: "featured",
  capacity: number,
): Promise<ICityAdConfiguration> => {
  return await updateCityAdConfigInDB(id, { featuredCapacity: capacity });
};

const getSellerActiveCitiesFromDB = async (
  query?: Record<string, unknown>,
): Promise<ICityAdConfiguration[]> => {
  const filter: Record<string, any> = { status: SLOT_CONFIG_STATUS.ACTIVE };

  if (query) {
    if (query.country) {
      filter.country = {
        $regex: (query.country as string).trim(),
        $options: "i",
      };
    }
    if (query.province) {
      filter.province = {
        $regex: (query.province as string).trim(),
        $options: "i",
      };
    }
    if (query.city) {
      filter.city = { $regex: (query.city as string).trim(), $options: "i" };
    }
    if (query.canton) {
      filter.$or = [
        { canton: { $regex: (query.canton as string).trim(), $options: "i" } },
        { city: { $regex: (query.canton as string).trim(), $options: "i" } },
      ];
    }
    if (query.sector) {
      filter.sector = {
        $regex: (query.sector as string).trim(),
        $options: "i",
      };
    }
    if (query.neighborhood) {
      filter.neighborhood = {
        $regex: (query.neighborhood as string).trim(),
        $options: "i",
      };
    }
  }

  return await CityAdConfiguration.find(filter);
};

const getCityWiseAvailabilitySummaryFromDB = async (
  startDateStr?: string,
  endDateStr?: string,
): Promise<any[]> => {
  const cities = await CityAdConfiguration.find({
    status: SLOT_CONFIG_STATUS.ACTIVE,
  }).lean();

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const startDate = startDateStr ? new Date(startDateStr) : today;
  const endDate = endDateStr ? new Date(endDateStr) : tomorrow;

  const summary = await Promise.all(
    cities.map(async (city) => {
      // Featured summary
      const featuredTotal = city.featuredCapacity || 0;
      const featuredBookedObj = await getOverlappingBookedSlots(
        city._id as Types.ObjectId,
        ADVERTISEMENT_TYPE.FEATURED,
        startDate,
        endDate,
      );
      const featuredBooked = featuredBookedObj.bookedSlots;
      const featuredAvailable = Math.max(0, featuredTotal - featuredBooked);

      return {
        cityConfig: {
          _id: city._id,
          country: city.country,
          countryCode: city.countryCode,
          province: city.province || "",
          city: city.city,
          canton: city.canton || city.city,
          sector: city.sector || "",
          neighborhood: city.neighborhood || "",
          latitude: city.latitude,
          longitude: city.longitude,
          status: city.status,
        },
        featured: {
          total: featuredTotal,
          booked: featuredBooked,
          available: featuredAvailable,
          enabled: city.featuredEnabled,
        },
      };
    }),
  );

  return summary;
};

const getCityBookingStatisticsFromDB = async (
  cityAdConfigId: string,
): Promise<any> => {
  if (!Types.ObjectId.isValid(cityAdConfigId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid City Slot Config ID");
  }

  const config = await CityAdConfiguration.findById(cityAdConfigId).lean();
  if (!config) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "City slot configuration not found",
    );
  }

  const now = new Date();

  // Execute all booking status counts concurrently
  const [activeCount, upcomingCount, expiredCount, cancelledCount] =
    await Promise.all([
      // Active bookings (status ACTIVE and end date not passed)
      Advertisement.countDocuments({
        cityAdConfigId: config._id,
        status: ADVERTISEMENT_STATUS.ACTIVE,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }),

      // Upcoming bookings (status ACTIVE and start date in the future)
      Advertisement.countDocuments({
        cityAdConfigId: config._id,
        status: ADVERTISEMENT_STATUS.ACTIVE,
        startDate: { $gt: now },
      }),

      // Expired bookings (status EXPIRED or status ACTIVE and end date in the past)
      Advertisement.countDocuments({
        cityAdConfigId: config._id,
        $or: [
          { status: ADVERTISEMENT_STATUS.EXPIRED },
          { status: ADVERTISEMENT_STATUS.ACTIVE, endDate: { $lt: now } },
        ],
      }),

      // Cancelled bookings
      Advertisement.countDocuments({
        cityAdConfigId: config._id,
        status: ADVERTISEMENT_STATUS.CANCELLED,
      }),
    ]);

  return {
    cityConfig: {
      _id: config._id,
      country: config.country,
      countryCode: config.countryCode,
      province: config.province || "",
      city: config.city,
      canton: config.canton || config.city,
      sector: config.sector || "",
      neighborhood: config.neighborhood || "",
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
