import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { StoreService } from "./store.service";

const createDraftStore = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.createDraftStoreToDB(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Draft store created or retrieved successfully",
    data: result,
  });
});

const getDraftStore = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.getDraftStoreFromDB(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Draft store retrieved successfully",
    data: result,
  });
});

const updateStep1 = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.updateStepToDB(userId, 1, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store Step 1 updated successfully",
    data: result,
  });
});

const updateStep2 = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.updateStepToDB(userId, 2, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store Step 2 updated successfully",
    data: result,
  });
});

const updateStep3 = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.updateStepToDB(userId, 3, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store Step 3 updated successfully",
    data: result,
  });
});

const updateStep4 = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.updateStepToDB(userId, 4, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store Step 4 updated successfully",
    data: result,
  });
});

const publishStore = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await StoreService.publishStoreToDB(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store published successfully, under review now",
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

export const StoreController = {
  createDraftStore,
  getDraftStore,
  updateStep1,
  updateStep2,
  updateStep3,
  updateStep4,
  publishStore,
  getMyStore,
};
