import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { StoreService } from "./store.service";

const createStore = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.createStoreToDB(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Store created successfully, under review now",
    data: result,
  });
});

const updateStore = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.updateStoreInDB(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store updated successfully",
    data: result,
  });
});

const getMyStore = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.getMyStoreFromDB(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store and Seller details retrieved successfully",
    data: result,
  });
});

const updateStoreStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = await StoreService.updateStoreStatusInDB(id, status);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store status updated successfully",
    data: result,
  });
});

const getStoreDetails = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await StoreService.getStoreDetailsFromDB(id, req.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store details and listings retrieved successfully",
    data: result,
  });
});

const getAllStores = catchAsync(async (req: Request, res: Response) => {
  const result = await StoreService.getAllStoresFromDB(req.query, req.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Stores retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const verifyIdentity = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.verifyStoreIdentityInDB(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store identity verification documents submitted successfully",
    data: result,
  });
});

const updateStoreVerification = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { isVerified } = req.body;
    const result = await StoreService.updateStoreVerificationInDB(
      id,
      isVerified,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Store verification status updated successfully",
      data: result,
    });
  },
);

const getSellerDashboard = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.getSellerDashboardFromDB(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Seller dashboard details retrieved successfully",
    data: result,
  });
});

export const StoreController = {
  createStore,
  updateStore,
  getMyStore,
  updateStoreStatus,
  getStoreDetails,
  getAllStores,
  verifyIdentity,
  updateStoreVerification,
  getSellerDashboard,
};
