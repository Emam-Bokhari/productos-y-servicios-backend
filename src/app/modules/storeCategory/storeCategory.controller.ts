import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { StoreCategoryService } from "./storeCategory.service";

const createCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await StoreCategoryService.createCategoryToDB(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Category Created Successfully",
    data: result,
  });
});

const getAllCategories = catchAsync(async (req: Request, res: Response) => {
  const result = await StoreCategoryService.getAllCategoriesFromDB(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Categories Retrieved Successfully",
    data: result,
  });
});

const getCategoryById = catchAsync(async (req: Request, res: Response) => {
  const result = await StoreCategoryService.getCategoryByIdFromDB(req.params.storeCategoryId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Category Retrieved Successfully",
    data: result,
  });
});

const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await StoreCategoryService.updateCategoryInDB(
    req.params.storeCategoryId,
    req.body
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Category Updated Successfully",
    data: result,
  });
});

const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await StoreCategoryService.deleteCategoryFromDB(req.params.storeCategoryId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Category Deleted Successfully",
    data: result,
  });
});

export const StoreCategoryController = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
