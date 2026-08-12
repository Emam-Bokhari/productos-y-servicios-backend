import { z } from "zod";
import { PRODUCT_STATUS } from "./product.constant";

const createProductSchema = z.object({
  body: z.object({
    title: z.string({ required_error: "Product title is required" }).min(1),
    activePrice: z.coerce.number({ required_error: "Active price is required" }).min(0),
    originalPrice: z.coerce.number().min(0).optional(),
    description: z.string({ required_error: "Description is required" }).min(1),
    additionalInformation: z.string().optional(),
    images: z.array(z.string()).optional(),
  }),
});

const updateProductSchema = z.object({
  body: z.object({
    title: z.string().min(1).optional(),
    activePrice: z.coerce.number().min(0).optional(),
    originalPrice: z.coerce.number().min(0).optional(),
    description: z.string().min(1).optional(),
    additionalInformation: z.string().optional(),
    images: z.array(z.string()).optional(),
    status: z.enum([PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.INACTIVE, PRODUCT_STATUS.OUT_OF_STOCK]).optional(),
  }),
});

export const ProductValidation = {
  createProductSchema,
  updateProductSchema,
};
