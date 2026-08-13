import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { SubscriptionPackageService } from "./subscriptionPackage.service";

const createPackage = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPackageService.createSubscriptionPackageInDB(
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Subscription package created successfully",
    data: result,
  });
});

const getAllPackages = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPackageService.subscriptionPackagesFromDB(
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Subscription packages retrieved successfully",
    data: result,
  });
});

const getSinglePackage = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPackageService.subscriptionPackageByIdFromDB(
    req.params.id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Subscription package retrieved successfully",
    data: result,
  });
});

const updatePackage = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPackageService.updateSubscriptionPackageInDB(
    req.params.id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Subscription package updated successfully",
    data: result,
  });
});

const deletePackage = catchAsync(async (req: Request, res: Response) => {
  const result =
    await SubscriptionPackageService.deleteSubscriptionPackageFromDB(
      req.params.id,
    );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Subscription package deleted successfully",
    data: result,
  });
});

const updatePackageStatus = catchAsync(async (req: Request, res: Response) => {
  const { status } = req.body;
  const result =
    await SubscriptionPackageService.updateSubscriptionPackageStatusInDB(
      req.params.id,
      status,
    );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: `Subscription package status updated to ${status} successfully`,
    data: result,
  });
});

export const SubscriptionPackageController = {
  createPackage,
  getAllPackages,
  getSinglePackage,
  updatePackage,
  deletePackage,
  updatePackageStatus,
};
