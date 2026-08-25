import { z } from "zod";
import { DAYS } from "../../../constants/days";
import { isValidTimezone } from "../../../shared/timezoneHelper";

const createStoreSchema = z.object({
  body: z.object({
    storeType: z.enum(["product_store", "service_store"], {
      required_error:
        "Store type must be either product_store or service_store",
    }),
    displayName: z.string({
      required_error: "Display name is required",
    }),
    description: z.string({
      required_error: "Description is required",
    }),
    categoryId: z
      .string({
        required_error: "Category ID is required",
      })
      .refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
        message: "Invalid category ID format",
      }),
    logo: z.string({
      required_error: "Logo is required",
    }),
    coverImage: z.string({
      required_error: "Cover image is required",
    }),
    phone: z.string({
      required_error: "Phone number is required",
    }),
    whatsapp: z.string().optional(),
    email: z
      .string({
        required_error: "Email is required",
      })
      .email("Invalid email format"),
    streetAddress: z.string({
      required_error: "Street address is required",
    }),
    city: z.string({
      required_error: "City is required",
    }),
    postalCode: z.string({
      required_error: "Postal code is required",
    }),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    businessLicenseNumber: z.string({
      required_error: "Business License Number is required",
    }),
    tradeLicense: z.string({
      required_error: "Trade license is required",
    }),
    tinNumber: z.string({
      required_error: "TIN number is required",
    }),
    workingDays: z.array(z.nativeEnum(DAYS)).optional(),
    openingTime: z.string().optional(),
    closingTime: z.string().optional(),
    isOpen24Hours: z.boolean().optional(),
    timezone: z.string().optional().refine((val) => !val || isValidTimezone(val), {
      message: "Invalid IANA timezone identifier",
    }),
  }),
});

const updateStoreSchema = z.object({
  body: z.object({
    storeType: z
      .enum(["product_store", "service_store"], {
        required_error:
          "Store type must be either product_store or service_store",
      })
      .optional(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    categoryId: z
      .string()
      .refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
        message: "Invalid category ID format",
      })
      .optional(),
    logo: z.string().optional(),
    coverImage: z.string().optional(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z
      .string()
      .email("Invalid email format")
      .optional()
      .or(z.literal("")),
    streetAddress: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    businessLicenseNumber: z.string().optional(),
    tradeLicense: z.string().optional(),
    tinNumber: z.string().optional(),
    workingDays: z.array(z.nativeEnum(DAYS)).optional(),
    openingTime: z.string().optional(),
    closingTime: z.string().optional(),
    isOpen24Hours: z.boolean().optional(),
    timezone: z.string().optional().refine((val) => !val || isValidTimezone(val), {
      message: "Invalid IANA timezone identifier",
    }),
  }),
});

const updateStoreStatusSchema = z.object({
  body: z.object({
    status: z.enum(["under_review", "active", "rejected", "suspended"], {
      required_error: "Status is required",
    }),
  }),
});

const verifyIdentitySchema = z.object({
  body: z.object({
    documentType: z.enum(["nid", "passport"], {
      required_error: "Document type must be either nid or passport",
    }),
    documentFront: z.string({
      required_error: "Front side document image is required",
    }),
    documentBack: z.string().optional(),
  }),
});

const updateStoreVerificationSchema = z.object({
  body: z.object({
    isVerified: z.boolean({
      required_error: "isVerified boolean status is required",
    }),
  }),
});

export const StoreValidation = {
  createStoreSchema,
  updateStoreSchema,
  updateStoreStatusSchema,
  verifyIdentitySchema,
  updateStoreVerificationSchema,
};
