import { JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import { USER_ROLES } from "../../../enums/user";
import ApiError from "../../../errors/ApiErrors";
import { Subscription } from "./subscription.model";
import { User } from "../user/user.model";
import { Store } from "../store/store.model";
import stripe from "../../../config/stripe";
import QueryBuilder from "../../builder/queryBuilder";

const getMySubscriptionsFromDB = async (userId: string) => {
  return await Subscription.find({ userId })
    .populate("packageId")
    .populate("cityConfigId");
};

const getSingleSubscriptionFromDB = async (id: string, user: JwtPayload) => {
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

const getAllSubscriptionsFromDB = async (query: Record<string, unknown>) => {
  const { searchTerm, plan, status, packageType, ...remainingQuery } = query;

  const filter: Record<string, any> = {};

  // 1. Search term logic: search store display name, user name, or user email
  if (searchTerm) {
    const matchingStores = await Store.find({
      displayName: { $regex: searchTerm, $options: "i" },
    }).select("owner");

    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
      ],
    }).select("_id");

    const storeOwnerIds = matchingStores.map((store) => store.owner);
    const userIds = matchingUsers.map((user) => user._id);

    const combinedUserIds = [...new Set([...storeOwnerIds, ...userIds])];
    filter.userId = { $in: combinedUserIds };
  }

  // 2. Plan filter (filters by packageId)
  if (plan && mongoose.Types.ObjectId.isValid(plan as string)) {
    filter.packageId = new mongoose.Types.ObjectId(plan as string);
  }

  // 3. Status filter
  if (status) {
    filter.status = status;
  }

  // 4. PackageType filter
  if (packageType) {
    filter.packageType = packageType;
  }

  // Execute QueryBuilder on Subscription
  const builder = new QueryBuilder(Subscription.find(filter), remainingQuery)
    .filter()
    .sort()
    .paginate()
    .fields();

  const subscriptions = await builder.modelQuery
    .populate("packageId")
    .populate("userId", "name email profileImage phone");

  const meta = await builder.countTotal();

  // Look up store details for each subscription
  const data = await Promise.all(
    subscriptions.map(async (sub) => {
      const subObj = sub.toObject();
      const store = await Store.findOne({ owner: sub.userId?._id }).populate(
        "categoryId",
        "name",
      );
      return {
        ...subObj,
        store: store ? store.toObject() : null,
      };
    }),
  );

  return {
    meta,
    data,
  };
};

const cancelSubscriptionFromDB = async (id: string, user: JwtPayload) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const subscription = await Subscription.findById(id);
  if (!subscription) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription not found");
  }

  const isAdmin =
    user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;

  // Check permissions (only owner or admin can cancel)
  if (!isAdmin && subscription.userId.toString() !== user.id) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You do not have permission to cancel this subscription",
    );
  }

  if (subscription.status === "canceled") {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Subscription is already canceled",
    );
  }

  // If Stripe subscription exists, cancel in Stripe
  if (subscription.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch (error: any) {
      if (error.code !== "resource_missing") {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          error.message || "Failed to cancel subscription on Stripe",
        );
      }
    }
  }

  // Update subscription locally
  subscription.status = "canceled";
  subscription.expiresAt = new Date();
  await subscription.save();

  // Update user subscription details
  await User.findByIdAndUpdate(subscription.userId, {
    subscriptionStatus: "canceled",
    subscriptionExpiresAt: new Date(),
  });

  return subscription;
};

export const SubscriptionService = {
  getMySubscriptionsFromDB,
  getSingleSubscriptionFromDB,
  getAllSubscriptionsFromDB,
  cancelSubscriptionFromDB,
};
