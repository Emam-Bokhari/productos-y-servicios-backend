import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { BroadcastServices } from "./broadcast.service";

const createBroadcast = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const result = await BroadcastServices.createBroadcast(user, req.body);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.CREATED,
    message: "Announcement broadcasted successfully",
    data: result,
  });
});

const getBroadcasts = catchAsync(async (req: Request, res: Response) => {
  const result = await BroadcastServices.getBroadcastsFromDB(req.query);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Broadcasts retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const deleteBroadcast = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await BroadcastServices.deleteBroadcastFromDB(id);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Broadcast deleted successfully",
    data: result,
  });
});

export const BroadcastControllers = {
  createBroadcast,
  getBroadcasts,
  deleteBroadcast,
};