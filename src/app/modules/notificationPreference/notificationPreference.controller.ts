import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { StatusCodes } from "http-status-codes";
import { NotificationPreferenceService } from "./notificationPreference.service";

const getNotificationPreference = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const result =
      await NotificationPreferenceService.getNotificationPreferenceByUser(user);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Notification Preference Retrieved Successfully",
      data: result,
    });
  },
);

const updateNotificationPreference = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const result =
      await NotificationPreferenceService.updateNotificationPreference(
        user,
        req.body,
      );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Notification Preference Updated Successfully",
      data: result,
    });
  },
);

const deleteNotificationPreference = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const result =
      await NotificationPreferenceService.deleteNotificationPreference(user);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Notification Preference Deleted Successfully",
      data: result,
    });
  },
);

export const NotificationPreferenceController = {
  getNotificationPreference,
  updateNotificationPreference,
  deleteNotificationPreference,
};
