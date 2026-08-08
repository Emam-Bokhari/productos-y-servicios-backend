import { z } from "zod";

const updateStep1Schema = z.object({
  body: z.object({
    storeType: z.enum(["product_store", "service_store"], {
      required_error: "Store type must be either product_store or service_store",
    }),
  }),
});

const updateStep2Schema = z.object({
  body: z.object({
    displayName: z.string().optional(),
    description: z.string().optional(),
    categoryId: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Invalid category ID format",
    }).optional(),
    logo: z.string().optional(),
    coverImage: z.string().optional(),
  }),
});

const updateStep3Schema = z.object({
  body: z.object({
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z.string().email("Invalid email format").optional(),
    streetAddress: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }),
});

const updateStep4Schema = z.object({
  body: z.object({
    businessLicenseNumber: z.string().optional(),
    tradeLicenseImage: z.string().optional(),
    tinNumber: z.string().optional(),
  }),
});

export const StoreValidation = {
  updateStep1Schema,
  updateStep2Schema,
  updateStep3Schema,
  updateStep4Schema,
};
