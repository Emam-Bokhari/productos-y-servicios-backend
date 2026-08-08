import { z } from "zod";

const createCategoryZodSchema = z.object({
  body: z.object({
    name: z.string({
      required_error: "Category name is required",
    }).min(1, "Category name cannot be empty"),
    description: z.string().optional(),
    type: z.enum(["product", "service"], {
      required_error: "Type is required and must be either product or service",
    }),
    status: z.enum(["active", "inactive"]).optional(),
  }),
});

const updateCategoryZodSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Category name cannot be empty").optional(),
    description: z.string().optional(),
    type: z.enum(["product", "service"]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }),
});

export const StoreCategoryValidation = {
  createCategoryZodSchema,
  updateCategoryZodSchema,
};
