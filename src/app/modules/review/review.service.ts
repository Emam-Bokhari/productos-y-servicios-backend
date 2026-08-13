import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { Store } from "../store/store.model";
import { Review } from "./review.model";
import QueryBuilder from "../../builder/queryBuilder";

// Helper function to update store average rating and review count
const updateStoreRatings = async (storeId: string) => {
  const stats = await Review.aggregate([
    {
      $match: {
        storeId: new Types.ObjectId(storeId),
      },
    },
    {
      $group: {
        _id: "$storeId",
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Store.findByIdAndUpdate(storeId, {
      averageRating: parseFloat(stats[0].averageRating.toFixed(1)),
      ratingCount: stats[0].ratingCount,
    });
  } else {
    await Store.findByIdAndUpdate(storeId, {
      averageRating: 0,
      ratingCount: 0,
    });
  }
};

const createReviewInDB = async (
  userId: string,
  payload: { storeId: string; rating: number; comment: string }
) => {
  const { storeId, rating, comment } = payload;

  const store = await Store.findById(storeId);
  if (!store) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Store not found.");
  }

  // A store owner cannot review their own store
  if (store.owner.toString() === userId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Store owners cannot review their own store."
    );
  }

  // A user can review a store only once
  const existingReview = await Review.findOne({ storeId, userId });
  if (existingReview) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "You have already reviewed this store."
    );
  }

  const review = await Review.create({
    storeId,
    userId,
    rating,
    comment,
  });

  // Recalculate average rating and total reviews on the store
  await updateStoreRatings(storeId);

  return review;
};

const replyAsStoreOwnerInDB = async (
  userId: string,
  reviewId: string,
  payload: { comment: string }
) => {
  const review = await Review.findById(reviewId).populate("storeId");
  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Review not found.");
  }

  const store = review.storeId as any;
  if (!store || store.owner.toString() !== userId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Only the store owner can reply to this review."
    );
  }

  if (review.ownerReply) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Store owner has already replied to this review. Only one reply is allowed."
    );
  }

  review.ownerReply = {
    comment: payload.comment,
    createdAt: new Date(),
  };

  await review.save();
  return review;
};

const replyAsReviewerInDB = async (
  userId: string,
  reviewId: string,
  payload: { comment: string }
) => {
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Review not found.");
  }

  if (review.userId.toString() !== userId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Only the reviewer who wrote the review can reply."
    );
  }

  if (!review.ownerReply) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "You cannot reply until the store owner has replied."
    );
  }

  if (review.userReply) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "You have already replied to the store owner's response. Only one reply is allowed."
    );
  }

  review.userReply = {
    comment: payload.comment,
    createdAt: new Date(),
  };

  await review.save();
  return review;
};

const getStoreReviewsFromDB = async (
  storeId: string,
  query: Record<string, unknown>
) => {
  if (!storeId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Store ID is required to retrieve reviews."
    );
  }

  const filterQuery = {
    storeId,
    ...query,
  };

  const builder = new QueryBuilder(Review.find(), filterQuery)
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await builder.modelQuery.populate({
    path: "userId",
    select: "name profileImage email role activeRole",
  });
  const meta = await builder.countTotal();

  // Aggregate rating counts for breakdown (1 to 5 stars)
  const ratingStats = await Review.aggregate([
    {
      $match: {
        storeId: new Types.ObjectId(storeId),
      },
    },
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
  ]);

  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratingStats.forEach((stat) => {
    const r = stat._id as number;
    if (breakdown[r] !== undefined) {
      breakdown[r] = stat.count;
    }
  });

  return {
    data,
    meta,
    ratingStats: breakdown,
  };
};

export const ReviewService = {
  createReviewInDB,
  replyAsStoreOwnerInDB,
  replyAsReviewerInDB,
  getStoreReviewsFromDB,
  updateStoreRatings, // Exported helper if needed elsewhere
};
