import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { ServiceService } from "./service.service";

const createService = catchAsync(async (req: Request, res: Response) => {
  const sellerId = req.user.id;
  const result = await ServiceService.createServiceToDB(sellerId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Service created successfully",
    data: result,
  });
});

const getMyServices = catchAsync(async (req: Request, res: Response) => {
  const sellerId = req.user.id;
  const result = await ServiceService.getMyServicesFromDB(sellerId, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "My service listings retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getAllServices = catchAsync(async (req: Request, res: Response) => {
  const result = await ServiceService.getAllServicesFromDB(req.query, req.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Services retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getSingleService = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await ServiceService.getSingleServiceFromDB(id, req.user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Service details retrieved successfully",
    data: result,
  });
});

const updateService = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const sellerId = req.user.id;
  const result = await ServiceService.updateServiceInDB(id, sellerId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Service updated successfully",
    data: result,
  });
});

const deleteService = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const sellerId = req.user.id;
  const result = await ServiceService.deleteServiceFromDB(id, sellerId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Service deleted successfully",
    data: result,
  });
});

export const ServiceController = {
  createService,
  getMyServices,
  getAllServices,
  getSingleService,
  updateService,
  deleteService,
};
