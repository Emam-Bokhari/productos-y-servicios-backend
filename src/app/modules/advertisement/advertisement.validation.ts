import { z } from "zod";
import {
  ADVERTISEMENT_TYPE,
} from "./advertisement.constant";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createAdvertisementSchema = z.object({
  body: z
    .object({
      campaignName: z.string({
        required_error: "Campaign name is required",
      }),
      cityAdConfigId: z
        .string({
          required_error: "City Slot Config ID is required",
        })
        .refine((val) => objectIdRegex.test(val), {
          message: "Invalid configuration ID format",
        }),
      advertisementType: z.enum(
        [ADVERTISEMENT_TYPE.BANNER, ADVERTISEMENT_TYPE.FEATURED],
        {
          required_error: "Advertisement type must be banner or featured",
        },
      ),
      startDate: z.string({
        required_error: "Start Date is required",
      }),
      endDate: z.string({
        required_error: "End Date is required",
      }),
      bannerImage: z.string().optional(),
      featuredImage: z.string().optional(),
    })
    .refine(
      (data) => {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        return start < end;
      },
      {
        message: "End Date must be greater than Start Date",
        path: ["endDate"],
      },
    )
    .refine(
      (data) => {
        // Start date cannot be in the past (allow current day - reset time to midnight for comparison)
        const start = new Date(data.startDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        start.setHours(0, 0, 0, 0);
        return start >= today;
      },
      {
        message: "Start Date cannot be in the past",
        path: ["startDate"],
      },
    ),
});

const updateAdvertisementSchema = z.object({
  body: z.object({
    campaignName: z.string().optional(),
    bannerImage: z.string().optional(),
    featuredImage: z.string().optional(),
  }),
});

const getUserAdsQuerySchema = z.object({
  query: z.object({
    latitude: z
      .string()
      .refine((val) => !isNaN(parseFloat(val)), {
        message: "Latitude must be a valid number string",
      })
      .optional(),
    longitude: z
      .string()
      .refine((val) => !isNaN(parseFloat(val)), {
        message: "Longitude must be a valid number string",
      })
      .optional(),
  }),
});

export const AdvertisementValidation = {
  createAdvertisementSchema,
  updateAdvertisementSchema,
  getUserAdsQuerySchema,
};
