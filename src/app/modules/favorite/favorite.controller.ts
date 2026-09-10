import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { FAVORITE_TYPE } from "../../../enums/favorite";
import { FavoriteService } from "./favorite.service";

const toggleFavorite = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id || req.user._id;
  const result = await FavoriteService.toggleFavoriteInDB(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const getMyFavorites = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id || req.user._id;
  const result = await FavoriteService.getMyFavoritesFromDB(userId, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Favorites retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const checkIsFavorited = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id || req.user._id;
  const { targetId, targetType } = req.query;

  const result = await FavoriteService.checkIsFavoritedFromDB(
    userId,
    targetId as string,
    targetType as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Favorite status checked successfully",
    data: result,
  });
});

const deleteFavorite = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id || req.user._id;
  const id =
    req.params.id ||
    (req.body?.targetId as string) ||
    (req.query?.targetId as string) ||
    (req.body?.id as string);

  if (!id) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Favorite ID or Target ID is required",
    );
  }

  const result = await FavoriteService.deleteFavoriteFromDB(userId, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Favorite item deleted successfully",
    data: result,
  });
});

export const FavoriteController = {
  toggleFavorite,
  getMyFavorites,
  checkIsFavorited,
  deleteFavorite,
};
