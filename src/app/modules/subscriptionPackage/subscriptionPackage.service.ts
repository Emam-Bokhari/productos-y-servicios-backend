import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import stripe from "../../../config/stripe";
import ApiError from "../../../errors/ApiErrors";
import { TSubscriptionPackage } from "./subscriptionPackage.interface";
import { SubscriptionPackage } from "./subscriptionPackage.model";

const mapDurationToStripeRecurring = (duration: string) => {
  switch (duration) {
    case "1 month":
      return { interval: "month" as const, interval_count: 1 };
    case "3 month":
      return { interval: "month" as const, interval_count: 3 };
    case "6 month":
      return { interval: "month" as const, interval_count: 6 };
    case "1 year":
      return { interval: "year" as const, interval_count: 1 };
    default:
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid duration option");
  }
};

const createSubscriptionPackageInDB = async (payload: TSubscriptionPackage) => {
  // 1. Create product in Stripe
  const stripeProduct = await stripe.products.create({
    name: payload.name,
    description: `Subscription package: ${payload.name} (${payload.duration})`,
    active: payload.status === "active",
  });

  // 2. Map recurring duration and create price in Stripe
  const recurring = mapDurationToStripeRecurring(payload.duration);
  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: Math.round(payload.price * 100), // convert dollars to cents
    currency: "usd",
    recurring,
    active: payload.status === "active",
  });

  // 3. Save to database
  const subscriptionPackage = await SubscriptionPackage.create({
    ...payload,
    stripeProductId: stripeProduct.id,
    stripePriceId: stripePrice.id,
  });

  if (!subscriptionPackage) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to create subscription package",
    );
  }

  return subscriptionPackage;
};

const subscriptionPackagesFromDB = async (query: Record<string, any>) => {
  const filter: Record<string, any> = {};
  if (query.status) {
    filter.status = query.status;
  }
  const packages = await SubscriptionPackage.find(filter);
  return packages;
};

const subscriptionPackageByIdFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const pkg = await SubscriptionPackage.findById(id);
  if (!pkg) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  return pkg;
};

const updateSubscriptionPackageInDB = async (
  id: string,
  payload: Partial<TSubscriptionPackage>,
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const existingPackage = await SubscriptionPackage.findById(id);
  if (!existingPackage) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  const updateData: Partial<TSubscriptionPackage> = { ...payload };

  // 1. If name changed, update Stripe Product
  if (
    payload.name &&
    payload.name !== existingPackage.name &&
    existingPackage.stripeProductId
  ) {
    await stripe.products.update(existingPackage.stripeProductId, {
      name: payload.name,
    });
  }

  // 2. If price or duration changed, create a new Stripe Price
  const hasPriceChanged =
    payload.price !== undefined && payload.price !== existingPackage.price;
  const hasDurationChanged =
    payload.duration !== undefined &&
    payload.duration !== existingPackage.duration;

  if (
    (hasPriceChanged || hasDurationChanged) &&
    existingPackage.stripeProductId
  ) {
    const updatedPrice =
      payload.price !== undefined ? payload.price : existingPackage.price;
    const updatedDuration =
      payload.duration !== undefined
        ? payload.duration
        : existingPackage.duration;

    const recurring = mapDurationToStripeRecurring(updatedDuration);
    const stripePrice = await stripe.prices.create({
      product: existingPackage.stripeProductId,
      unit_amount: Math.round(updatedPrice * 100),
      currency: "usd",
      recurring,
      active:
        payload.status !== undefined
          ? payload.status === "active"
          : existingPackage.status === "active",
    });

    // Deactivate the old price in Stripe
    if (existingPackage.stripePriceId) {
      await stripe.prices.update(existingPackage.stripePriceId, {
        active: false,
      });
    }

    updateData.stripePriceId = stripePrice.id;
  }

  // If status is updated in the payload, sync active status with Stripe
  if (
    payload.status !== undefined &&
    payload.status !== existingPackage.status &&
    existingPackage.stripeProductId
  ) {
    const isStripeActive = payload.status === "active";
    await stripe.products.update(existingPackage.stripeProductId, {
      active: isStripeActive,
    });
    if (existingPackage.stripePriceId) {
      await stripe.prices.update(existingPackage.stripePriceId, {
        active: isStripeActive,
      });
    }
  }

  const updatedPackage = await SubscriptionPackage.findByIdAndUpdate(
    id,
    updateData,
    { new: true },
  );

  if (!updatedPackage) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to update subscription package",
    );
  }

  return updatedPackage;
};

const deleteSubscriptionPackageFromDB = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const existingPackage = await SubscriptionPackage.findById(id);
  if (!existingPackage) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  // Deactivate Stripe Product and Price
  if (existingPackage.stripeProductId) {
    await stripe.products.update(existingPackage.stripeProductId, {
      active: false,
    });
  }
  if (existingPackage.stripePriceId) {
    await stripe.prices.update(existingPackage.stripePriceId, {
      active: false,
    });
  }

  // Soft delete from database
  const result = await SubscriptionPackage.softDeleteById(id);
  if (!result) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Failed to delete subscription package",
    );
  }

  return result;
};

const updateSubscriptionPackageStatusInDB = async (
  id: string,
  status: "active" | "inactive",
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid ID");
  }

  const existingPackage = await SubscriptionPackage.findById(id);
  if (!existingPackage) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  // Update Stripe Product and Price status
  if (existingPackage.stripeProductId) {
    await stripe.products.update(existingPackage.stripeProductId, {
      active: status === "active",
    });
  }
  if (existingPackage.stripePriceId) {
    await stripe.prices.update(existingPackage.stripePriceId, {
      active: status === "active",
    });
  }

  const updatedPackage = await SubscriptionPackage.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  );

  if (!updatedPackage) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to update status");
  }

  return updatedPackage;
};

export const SubscriptionPackageService = {
  createSubscriptionPackageInDB,
  subscriptionPackagesFromDB,
  subscriptionPackageByIdFromDB,
  updateSubscriptionPackageInDB,
  deleteSubscriptionPackageFromDB,
  updateSubscriptionPackageStatusInDB,
};
