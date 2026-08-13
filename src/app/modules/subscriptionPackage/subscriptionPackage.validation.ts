import { z } from "zod";

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
    duration: z.enum(["1 month", "3 month", "6 month", "1 year"], {
      required_error: "Duration is required",
    }),
    trialPeriodDays: z.number().nonnegative().optional(),
    features: z.array(z.string()).optional(),
  }),
});

const updateSubscriptionPackageSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    duration: z.enum(["1 month", "3 month", "6 month", "1 year"]).optional(),
    trialPeriodDays: z.number().nonnegative().optional(),
    features: z.array(z.string()).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }),
});

const toggleSubscriptionPackageStatusSchema = z.object({
  body: z.object({
    status: z.enum(["active", "inactive"], {
      required_error: "Status is required",
    }),
  }),
});

export const SubscriptionPackageValidation = {
  createSubscriptionPackageSchema,
  updateSubscriptionPackageSchema,
  toggleSubscriptionPackageStatusSchema,
};
