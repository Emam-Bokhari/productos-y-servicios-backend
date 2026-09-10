import { z } from "zod";
import { FAVORITE_TYPE } from "../../../enums/favorite";

const allowedTargetTypes = [
  ...Object.values(FAVORITE_TYPE),
  "store",
];

const targetTypeValidator = z
  .string()
  .transform((val) => val.toLowerCase())
  .refine(
    (val) => allowedTargetTypes.includes(val as any),
    {
      message:
        "Target type must be one of store, product_store, service_store, product, or service",
    },
  )
  .optional();

const toggleFavoriteSchema = z.object({
  body: z.object({
    targetId: z.string({
      required_error: "Target ID is required",
    }),
    targetType: targetTypeValidator,
  }),
});

const checkIsFavoritedSchema = z.object({
  query: z.object({
    targetId: z.string({
      required_error: "Target ID is required",
    }),
    targetType: targetTypeValidator,
  }),
});

export const FavoriteValidation = {
  toggleFavoriteSchema,
  checkIsFavoritedSchema,
};
