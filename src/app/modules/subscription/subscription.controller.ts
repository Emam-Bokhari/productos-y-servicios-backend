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

export const SubscriptionController = {
  getMySubscriptions,
};
