import { z } from "zod";
import { SERVICE_STATUS } from "./service.constant";

const createServiceSchema = z.object({
  body: z.object({
    title: z.string({ required_error: "Service title is required" }).min(1),
    activePrice: z.coerce
      .number({ required_error: "Active price is required" })
      .min(0),
    originalPrice: z.coerce.number().min(0).optional(),
    description: z.string({ required_error: "Description is required" }).min(1),
    whatsIncluded: z.array(z.string()).optional(),
    images: z.array(z.string()).optional(),
  }),
});

const updateServiceSchema = z.object({
  body: z.object({
    title: z.string().min(1).optional(),
    activePrice: z.coerce.number().min(0).optional(),
    originalPrice: z.coerce.number().min(0).optional(),
    description: z.string().min(1).optional(),
    whatsIncluded: z.array(z.string()).optional(),
    images: z.array(z.string()).optional(),
    status: z.enum([SERVICE_STATUS.ACTIVE, SERVICE_STATUS.INACTIVE]).optional(),
  }),
});

export const ServiceValidation = {
  createServiceSchema,
  updateServiceSchema,
};
