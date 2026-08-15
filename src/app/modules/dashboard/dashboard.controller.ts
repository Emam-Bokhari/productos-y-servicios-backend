import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { StatusCodes } from "http-status-codes";
import { DashboardService } from "./dashboard.service";

const getOverviewData = catchAsync(async (req: Request, res: Response) => {
  const { year } = req.query;
  const result = await DashboardService.getDashboardOverview(year as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Dashboard overview data retrieved successfully",
    data: result,
  });
});

export const DashboardController = {
  getOverviewData,
};
