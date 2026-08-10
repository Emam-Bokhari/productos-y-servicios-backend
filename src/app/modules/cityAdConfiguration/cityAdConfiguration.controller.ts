import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { CityAdConfigurationService } from "./cityAdConfiguration.service";

const createCityAdConfig = catchAsync(async (req: Request, res: Response) => {
  const result = await CityAdConfigurationService.createCityAdConfigToDB(
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "City slot configuration created successfully.",
    data: result,
  });
});

const getCityAdConfigs = catchAsync(async (req: Request, res: Response) => {
  const result = await CityAdConfigurationService.getCityAdConfigsFromDB(
    req.query,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "City slot configurations retrieved successfully.",
    pagination: result.meta,
    data: result.data,
  });
});

const getSingleCityConfig = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CityAdConfigurationService.getSingleCityConfigFromDB(id);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "City configuration details retrieved successfully.",
    data: result,
  });
});

const updateCityAdConfig = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await CityAdConfigurationService.updateCityAdConfigInDB(
    id,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "City slot configuration updated successfully.",
    data: result,
  });
});

// Removed redundant toggle/capacity controllers, as they are fully covered by updateCityAdConfig.

const getCityWiseAvailabilitySummary = catchAsync(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;
    const result =
      await CityAdConfigurationService.getCityWiseAvailabilitySummaryFromDB(
        startDate as string,
        endDate as string,
      );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "City-wise advertisement availability retrieved successfully.",
      data: result,
    });
  },
);

const getCityBookingStatistics = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result =
      await CityAdConfigurationService.getCityBookingStatisticsFromDB(id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "City booking statistics retrieved successfully.",
      data: result,
    });
  },
);

const getSellerActiveCities = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await CityAdConfigurationService.getSellerActiveCitiesFromDB();
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Available advertisement cities retrieved successfully.",
      data: result,
    });
  },
);

export const CityAdConfigurationController = {
  createCityAdConfig,
  getCityAdConfigs,
  getSingleCityConfig,
  updateCityAdConfig,
  getCityWiseAvailabilitySummary,
  getCityBookingStatistics,
  getSellerActiveCities,
};
