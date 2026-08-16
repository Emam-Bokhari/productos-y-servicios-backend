import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import stripe from "../../../config/stripe";
import ApiError from "../../../errors/ApiErrors";
import { TSubscriptionPackage } from "./subscriptionPackage.interface";
import { SubscriptionPackage } from "./subscriptionPackage.model";
import {
  SUBSCRIPTION_PACKAGE_DURATION,
  SUBSCRIPTION_PACKAGE_STATUS,
} from "./subscriptionPackage.constant";

const mapDurationToStripeRecurring = (duration: string) => {
  switch (duration) {
    case SUBSCRIPTION_PACKAGE_DURATION.SEVEN_DAYS:
      return { interval: "day" as const, interval_count: 7 };
    case SUBSCRIPTION_PACKAGE_DURATION.ONE_MONTH:
      return { interval: "month" as const, interval_count: 1 };
    case SUBSCRIPTION_PACKAGE_DURATION.THREE_MONTH:
      return { interval: "month" as const, interval_count: 3 };
    case SUBSCRIPTION_PACKAGE_DURATION.SIX_MONTH:
      return { interval: "month" as const, interval_count: 6 };
    case SUBSCRIPTION_PACKAGE_DURATION.ONE_YEAR:
      return { interval: "year" as const, interval_count: 1 };
    default:
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid duration option");
  }
};

const createSubscriptionPackageInDB = async (payload: TSubscriptionPackage) => {
  const status = payload.status || SUBSCRIPTION_PACKAGE_STATUS.ACTIVE;
  const isActive = status === SUBSCRIPTION_PACKAGE_STATUS.ACTIVE;

  // 1. Create product in Stripe
  const stripeProduct = await stripe.products.create({
    name: payload.name,
    description: `Subscription package: ${payload.name} (${payload.duration})`,
    active: isActive,
  });

  // 2. Map recurring duration and create price in Stripe
  const priceParams: any = {
    product: stripeProduct.id,
    unit_amount: Math.round(payload.price * 100), // convert dollars to cents
    currency: "usd",
    active: isActive,
  };

  if (payload.packageType === "store_creation") {
    priceParams.recurring = mapDurationToStripeRecurring(payload.duration);
  }

  const stripePrice = await stripe.prices.create(priceParams);

  // 3. Save to database
  const subscriptionPackage = await SubscriptionPackage.create({
    ...payload,
    status,
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

  const finalStatus =
    payload.status !== undefined ? payload.status : existingPackage.status;
  const isStripeActive = finalStatus === SUBSCRIPTION_PACKAGE_STATUS.ACTIVE;

  // 1. If name changed, update Stripe Product name
  if (
    payload.name &&
    payload.name !== existingPackage.name &&
    existingPackage.stripeProductId
  ) {
    await stripe.products.update(existingPackage.stripeProductId, {
      name: payload.name,
    });
  }

  // 2. If status changed, update Stripe Product active status
  if (
    payload.status !== undefined &&
    payload.status !== existingPackage.status &&
    existingPackage.stripeProductId
  ) {
    await stripe.products.update(existingPackage.stripeProductId, {
      active: isStripeActive,
    });
  }

  // 3. If price or duration changed, create a new Stripe Price
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
    const updatedPackageType =
      payload.packageType !== undefined
        ? payload.packageType
        : existingPackage.packageType;

    const priceParams: any = {
      product: existingPackage.stripeProductId,
      unit_amount: Math.round(updatedPrice * 100),
      currency: "usd",
      active: isStripeActive,
    };

    if (updatedPackageType === "store_creation") {
      priceParams.recurring = mapDurationToStripeRecurring(updatedDuration);
    }

    const stripePrice = await stripe.prices.create(priceParams);

    // Deactivate the old price in Stripe
    if (existingPackage.stripePriceId) {
      await stripe.prices.update(existingPackage.stripePriceId, {
        active: false,
      });
    }

    updateData.stripePriceId = stripePrice.id;
  } else {
    // If price/duration did not change but status did, sync the existing Price active status
    if (
      payload.status !== undefined &&
      payload.status !== existingPackage.status &&
      existingPackage.stripePriceId
    ) {
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
  status: SUBSCRIPTION_PACKAGE_STATUS,
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
      active: status === SUBSCRIPTION_PACKAGE_STATUS.ACTIVE,
    });
  }
  if (existingPackage.stripePriceId) {
    await stripe.prices.update(existingPackage.stripePriceId, {
      active: status === SUBSCRIPTION_PACKAGE_STATUS.ACTIVE,
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
