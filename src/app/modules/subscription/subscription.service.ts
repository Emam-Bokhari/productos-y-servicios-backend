import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import { USER_ROLES } from "../../../enums/user";
import ApiError from "../../../errors/ApiErrors";
import { Subscription } from "./subscription.model";

const getMySubscriptionsFromDB = async (userId: string) => {
  return await Subscription.find({ userId })
    .populate("packageId")
    .populate("cityConfigId");
};

const getSingleSubscriptionFromDB = async (
  id: string,
  user: JwtPayload
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const query: Record<string, any> = { _id: id };

  const isAdmin =
    user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdmin) {
    query.userId = user.id;
  }

  const result = await Subscription.findOne(query)
    .populate("packageId")
    .populate("cityConfigId");

  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription not found");
  }

  return result;
};

export const SubscriptionService = {
  getMySubscriptionsFromDB,
  getSingleSubscriptionFromDB,
};
