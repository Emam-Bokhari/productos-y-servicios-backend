import { z } from "zod";
import { SLOT_CONFIG_STATUS } from "./cityAdConfiguration.constant";

const createCityConfigSchema = z.object({
  body: z.object({
    country: z.string({
      required_error: "Country is required",
    }),
    countryCode: z.string({
      required_error: "Country Code is required",
    }),
    city: z.string({
      required_error: "City is required",
    }),
    latitude: z
      .number({
        required_error: "Latitude is required",
      })
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90"),
    longitude: z
      .number({
        required_error: "Longitude is required",
      })
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180"),
    featuredCapacity: z
      .number({
        required_error: "Featured slot capacity is required",
      })
      .min(0, "Capacity cannot be negative"),
    featuredEnabled: z.boolean().optional(),
    status: z
      .enum([SLOT_CONFIG_STATUS.ACTIVE, SLOT_CONFIG_STATUS.INACTIVE])
      .optional(),
  }),
});

const updateCityConfigSchema = z.object({
  body: z.object({
    country: z.string().optional(),
    countryCode: z.string().optional(),
    city: z.string().optional(),
    latitude: z
      .number()
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90")
      .optional(),
    longitude: z
      .number()
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180")
      .optional(),
    featuredCapacity: z
      .number()
      .min(0, "Capacity cannot be negative")
      .optional(),
    featuredEnabled: z.boolean().optional(),
    status: z
      .enum([SLOT_CONFIG_STATUS.ACTIVE, SLOT_CONFIG_STATUS.INACTIVE])
      .optional(),
  }),
});

const toggleCityAdConfigSchema = z.object({
  body: z.object({
    enabled: z.boolean({
      required_error: "Enabled boolean is required",
    }),
  }),
});

const updateCapacitySchema = z.object({
  body: z.object({
    capacity: z
      .number({
        required_error: "Capacity is required",
      })
      .min(0, "Capacity cannot be negative"),
  }),
});

export const CityAdConfigurationValidation = {
  createCityConfigSchema,
  updateCityConfigSchema,
  toggleCityAdConfigSchema,
  updateCapacitySchema,
};
