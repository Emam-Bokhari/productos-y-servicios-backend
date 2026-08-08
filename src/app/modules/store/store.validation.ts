import { z } from "zod";

const createStoreSchema = z.object({
  body: z.object({
    storeType: z.enum(["product_store", "service_store"], {
      required_error: "Store type must be either product_store or service_store",
    }),
    displayName: z.string({
      required_error: "Display name is required",
    }),
    description: z.string({
      required_error: "Description is required",
    }),
    categoryId: z.string({
      required_error: "Category ID is required",
    }).refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
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
    email: z.string({
      required_error: "Email is required",
    }).email("Invalid email format"),
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
    tradeLicenseImage: z.string({
      required_error: "Trade license image is required",
    }),
    tinNumber: z.string({
      required_error: "TIN number is required",
    }),
  }),
});

const updateStoreSchema = z.object({
  body: z.object({
    storeType: z.enum(["product_store", "service_store"], {
      required_error: "Store type must be either product_store or service_store",
    }).optional(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    categoryId: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Invalid category ID format",
    }).optional(),
    logo: z.string().optional(),
    coverImage: z.string().optional(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z.string().email("Invalid email format").optional().or(z.literal("")),
    streetAddress: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    businessLicenseNumber: z.string().optional(),
    tradeLicenseImage: z.string().optional(),
    tinNumber: z.string().optional(),
  }),
});

export const StoreValidation = {
  createStoreSchema,
  updateStoreSchema,
};
