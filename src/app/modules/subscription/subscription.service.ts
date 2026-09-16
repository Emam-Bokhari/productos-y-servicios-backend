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
  const subscriptions = await Subscription.find({ userId })
    .populate("packageId")
    .populate("cityConfigId")
    .sort({ createdAt: -1 });

  const now = new Date();

  return subscriptions.map((sub) => {
    const subObj = sub.toObject();
    const isExpired = sub.expiresAt ? new Date(sub.expiresAt) <= now : false;
    const diffMs = sub.expiresAt
      ? new Date(sub.expiresAt).getTime() - now.getTime()
      : 0;
    const remainingDays =
      diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;

    const invoiceNumber =
      subObj.invoiceNumber ||
      (subObj.trxId && subObj.trxId.startsWith("INV-") ? subObj.trxId : null);
    const safeInvoice = invoiceNumber
      ? invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")
      : null;
    const invoiceUrl =
      subObj.invoiceUrl ||
      (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
    const invoiceDownloadUrl = safeInvoice
      ? `/api/v1/invoices/download/${safeInvoice}`
      : `/api/v1/invoices/download/${subObj._id}`;

    return {
      ...subObj,
      invoiceNumber: invoiceNumber || undefined,
      invoiceUrl: invoiceUrl || undefined,
      invoiceDownloadUrl,
      remainingDays,
      isExpired,
    };
  });
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

  const now = new Date();
  const subObj = result.toObject();
  const isExpired = subObj.expiresAt ? new Date(subObj.expiresAt) <= now : false;
  const diffMs = subObj.expiresAt
    ? new Date(subObj.expiresAt).getTime() - now.getTime()
    : 0;
  const remainingDays =
    diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;

  const invoiceNumber =
    subObj.invoiceNumber ||
    (subObj.trxId && subObj.trxId.startsWith("INV-") ? subObj.trxId : null);
  const safeInvoice = invoiceNumber
    ? invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")
    : null;
  const invoiceUrl =
    subObj.invoiceUrl ||
    (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
  const invoiceDownloadUrl = safeInvoice
    ? `/api/v1/invoices/download/${safeInvoice}`
    : `/api/v1/invoices/download/${subObj._id}`;

  return {
    ...subObj,
    invoiceNumber: invoiceNumber || undefined,
    invoiceUrl: invoiceUrl || undefined,
    invoiceDownloadUrl,
    remainingDays,
    isExpired,
  };
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
  const now = new Date();
  const data = await Promise.all(
    subscriptions.map(async (sub) => {
      const subObj = sub.toObject();
      const store = await Store.findOne({ owner: sub.userId?._id }).populate(
        "categoryId",
        "name",
      );
      const isExpired = subObj.expiresAt
        ? new Date(subObj.expiresAt) <= now
        : false;
      const diffMs = subObj.expiresAt
        ? new Date(subObj.expiresAt).getTime() - now.getTime()
        : 0;
      const remainingDays =
        diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;

      const invoiceNumber =
        subObj.invoiceNumber ||
        (subObj.trxId && subObj.trxId.startsWith("INV-") ? subObj.trxId : null);
      const safeInvoice = invoiceNumber
        ? invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")
        : null;
      const invoiceUrl =
        subObj.invoiceUrl ||
        (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
      const invoiceDownloadUrl = safeInvoice
        ? `/api/v1/invoices/download/${safeInvoice}`
        : `/api/v1/invoices/download/${subObj._id}`;

      return {
        ...subObj,
        invoiceNumber: invoiceNumber || undefined,
        invoiceUrl: invoiceUrl || undefined,
        invoiceDownloadUrl,
        remainingDays,
        isExpired,
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

  // If legacy Stripe subscription exists, attempt cancel in Stripe
  if (
    subscription.stripeSubscriptionId &&
    subscription.stripeSubscriptionId.startsWith("sub_")
  ) {
    try {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch (error: any) {
      // Ignore Stripe cancellation error when using Datafast or expired
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
