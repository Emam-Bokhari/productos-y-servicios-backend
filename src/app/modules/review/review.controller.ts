import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { ReviewService } from "./review.service";

const createReview = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await ReviewService.createReviewInDB(userId, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Review submitted successfully",
    data: result,
  });
});

const replyAsStoreOwner = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await ReviewService.replyAsStoreOwnerInDB(
    userId,
    id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Store owner reply submitted successfully",
    data: result,
  });
});

const replyAsReviewer = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await ReviewService.replyAsReviewerInDB(userId, id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Reviewer reply submitted successfully",
    data: result,
  });
});

const getStoreReviews = catchAsync(async (req: Request, res: Response) => {
  const { storeId } = req.params;
  const result = await ReviewService.getStoreReviewsFromDB(storeId, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Reviews retrieved successfully",
    meta: result.meta,
    data: {
      reviews: result.data,
      ratingStats: result.ratingStats,
    },
  });
});

export const ReviewController = {
  createReview,
  replyAsStoreOwner,
  replyAsReviewer,
  getStoreReviews,
};
