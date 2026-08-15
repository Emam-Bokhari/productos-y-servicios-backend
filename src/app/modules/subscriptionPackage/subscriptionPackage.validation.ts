import { z } from "zod";
import {
  SUBSCRIPTION_PACKAGE_DURATION,
  SUBSCRIPTION_PACKAGE_STATUS,
  SUBSCRIPTION_PACKAGE_TYPE,
} from "./subscriptionPackage.constant";

const createSubscriptionPackageSchema = z.object({
  body: z.object({
    name: z
      .string({
        required_error: "Name is required",
      })
      .min(1, "Name cannot be empty"),
    price: z
      .number({
        required_error: "Price is required",
      })
      .nonnegative("Price must be a positive number"),
    duration: z.enum(
      [
        SUBSCRIPTION_PACKAGE_DURATION.SEVEN_DAYS,
        SUBSCRIPTION_PACKAGE_DURATION.ONE_MONTH,
        SUBSCRIPTION_PACKAGE_DURATION.THREE_MONTH,
        SUBSCRIPTION_PACKAGE_DURATION.SIX_MONTH,
        SUBSCRIPTION_PACKAGE_DURATION.ONE_YEAR,
      ],
      {
        required_error: "Duration is required",
      },
    ),
    packageType: z.enum(
      [
        SUBSCRIPTION_PACKAGE_TYPE.STORE_CREATION,
        SUBSCRIPTION_PACKAGE_TYPE.POST_ADD,
      ],
      {
        required_error: "Package type is required",
      },
    ),
    listingLimit: z.number().nonnegative().optional(),
    isUnlimitedListings: z.boolean().optional(),
    trialEnabled: z.boolean().optional(),
    trialPeriodDays: z.number().nonnegative().optional(),
    features: z.array(z.string()).optional(),
  }),
});

const updateSubscriptionPackageSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    duration: z
      .enum([
        SUBSCRIPTION_PACKAGE_DURATION.SEVEN_DAYS,
        SUBSCRIPTION_PACKAGE_DURATION.ONE_MONTH,
        SUBSCRIPTION_PACKAGE_DURATION.THREE_MONTH,
        SUBSCRIPTION_PACKAGE_DURATION.SIX_MONTH,
        SUBSCRIPTION_PACKAGE_DURATION.ONE_YEAR,
      ])
      .optional(),
    packageType: z
      .enum([
        SUBSCRIPTION_PACKAGE_TYPE.STORE_CREATION,
        SUBSCRIPTION_PACKAGE_TYPE.POST_ADD,
      ])
      .optional(),
    listingLimit: z.number().nonnegative().optional(),
    isUnlimitedListings: z.boolean().optional(),
    trialEnabled: z.boolean().optional(),
    trialPeriodDays: z.number().nonnegative().optional(),
    features: z.array(z.string()).optional(),
    status: z
      .enum([
        SUBSCRIPTION_PACKAGE_STATUS.ACTIVE,
        SUBSCRIPTION_PACKAGE_STATUS.INACTIVE,
      ])
      .optional(),
  }),
});

const toggleSubscriptionPackageStatusSchema = z.object({
  body: z.object({
    status: z.enum(
      [
        SUBSCRIPTION_PACKAGE_STATUS.ACTIVE,
        SUBSCRIPTION_PACKAGE_STATUS.INACTIVE,
      ],
      {
        required_error: "Status is required",
      },
    ),
  }),
});

export const SubscriptionPackageValidation = {
  createSubscriptionPackageSchema,
  updateSubscriptionPackageSchema,
  toggleSubscriptionPackageStatusSchema,
};
