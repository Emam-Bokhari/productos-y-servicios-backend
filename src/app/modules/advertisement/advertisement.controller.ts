import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { AdvertisementService } from "./advertisement.service";

// ----------------------------------------------------
// ADMIN CONTROLLERS
// ----------------------------------------------------

const getAllBookings = catchAsync(async (req: Request, res: Response) => {
  const result = await AdvertisementService.getBookingsByStatusFromDB(
    req.query,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Advertisement bookings retrieved successfully.",
    pagination: result.meta,
    data: result.data,
  });
});

// ----------------------------------------------------
// SELLER / USER CONTROLLERS
// ----------------------------------------------------

const verifySellerForPosting = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AdvertisementService.verifySellerForPostingInDB(
      req.user.id,
    );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: result.message,
      data: result,
    });
  },
);

const getSlotAvailability = catchAsync(async (req: Request, res: Response) => {
  const {
    cityAdConfigId,
    advertisementType,
    startDate,
    endDate,
    country,
    city,
    latitude,
    longitude,
  } = req.query;
  const result = await AdvertisementService.getSlotAvailabilityFromDB(
    cityAdConfigId as string,
    advertisementType as string,
    startDate as string,
    endDate as string,
    {
      country: country as string,
      city: city as string,
      latitude: latitude as string,
      longitude: longitude as string,
    },
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Slot availability details retrieved successfully.",
    data: result,
  });
});

const createAdvertisement = catchAsync(async (req: Request, res: Response) => {
  const sellerId = req.user.id;
  const result = await AdvertisementService.createAdvertisementToDB(
    sellerId,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Advertisement created and slot booked successfully.",
    data: result,
  });
});

const getSellerAdvertisements = catchAsync(
  async (req: Request, res: Response) => {
    const sellerId = req.user.id;
    const result = await AdvertisementService.getSellerAdvertisementsFromDB(
      sellerId,
      req.query,
    );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "My advertisements retrieved successfully.",
      pagination: result.meta,
      data: result.data,
    });
  },
);

const getSellerAdvertisementDetails = catchAsync(
  async (req: Request, res: Response) => {
    const sellerId = req.user.id;
    const { id } = req.params;
    const result =
      await AdvertisementService.getSellerAdvertisementDetailsFromDB(
        id,
        sellerId,
      );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Advertisement details retrieved successfully.",
      data: result,
    });
  },
);

const cancelAdvertisement = catchAsync(async (req: Request, res: Response) => {
  const sellerId = req.user.id;
  const { id } = req.params;
  const result = await AdvertisementService.cancelAdvertisementInDB(
    id,
    sellerId,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Advertisement booking cancelled successfully.",
    data: result,
  });
});

const updateAdvertisement = catchAsync(async (req: Request, res: Response) => {
  const sellerId = req.user.id;
  const { id } = req.params;
  const result = await AdvertisementService.updateAdvertisementInDB(
    id,
    sellerId,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Advertisement updated successfully.",
    data: result,
  });
});

const getAdvertisementBookingInfo = catchAsync(
  async (req: Request, res: Response) => {
    const sellerId = req.user.id;
    const { id } = req.params;
    const result =
      await AdvertisementService.getSellerAdvertisementDetailsFromDB(
        id,
        sellerId,
      );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Advertisement booking details retrieved successfully.",
      data: result,
    });
  },
);

const getUserAdvertisements = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const { latitude, longitude, storeType } = req.query;
    const result = await AdvertisementService.getUserAdvertisementsFromDB(
      userId,
      latitude as string,
      longitude as string,
      storeType as string,
    );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Advertisements retrieved successfully.",
      data: result,
    });
  },
);

export const AdvertisementController = {
  getAllBookings,
  verifySellerForPosting,
  getSlotAvailability,
  createAdvertisement,
  getSellerAdvertisements,
  getSellerAdvertisementDetails,
  cancelAdvertisement,
  updateAdvertisement,
  getAdvertisementBookingInfo,
  getUserAdvertisements,
};
