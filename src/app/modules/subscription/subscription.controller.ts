import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { SubscriptionService } from "./subscription.service";

const getMySubscriptions = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await SubscriptionService.getMySubscriptionsFromDB(userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User subscriptions retrieved successfully",
    data: result,
  });
});

const getSingleSubscription = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user;
  const result = await SubscriptionService.getSingleSubscriptionFromDB(id, user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Subscription retrieved successfully",
    data: result,
  });
});

export const SubscriptionController = {
  getMySubscriptions,
  getSingleSubscription,
};
