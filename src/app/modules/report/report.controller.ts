import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { ReportService } from "./report.service";
import { REPORT_REASON } from "./report.constant";

const getReportReasons = catchAsync(async (req: Request, res: Response) => {
  const reasons = Object.values(REPORT_REASON).map((value) => ({
    value,
    label: value
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  }));

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Report reasons retrieved successfully",
    data: reasons,
  });
});

const createReport = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await ReportService.createReportInDB(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Report submitted successfully. Our team will review it.",
    data: result,
  });
});

const getMyReports = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await ReportService.getMyReportsFromDB(userId, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "My submitted reports retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getAllReports = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getAllReportsFromDB(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Reports retrieved successfully",
    meta: result.meta,
    data: {
      reports: result.data,
      summary: result.summary,
    },
  });
});

const getReportById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ReportService.getReportByIdFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Report details retrieved successfully",
    data: result,
  });
});

const updateReportStatus = catchAsync(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const { id } = req.params;
  const result = await ReportService.updateReportStatusInDB(
    adminId,
    id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Report status updated successfully",
    data: result,
  });
});

const deleteReportById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ReportService.deleteReportByIdFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Report deleted successfully",
    data: result,
  });
});

const getReportStats = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getReportStatsFromDB();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Report statistics retrieved successfully",
    data: result,
  });
});

export const ReportController = {
  getReportReasons,
  createReport,
  getMyReports,
  getAllReports,
  getReportById,
  updateReportStatus,
  deleteReportById,
  getReportStats,
};
