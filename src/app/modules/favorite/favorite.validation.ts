import { z } from "zod";
import { FAVORITE_TYPE } from "../../../enums/favorite";

const toggleFavoriteSchema = z.object({
  body: z.object({
    targetId: z.string({
      required_error: "Target ID is required",
    }),
    targetType: z.nativeEnum(FAVORITE_TYPE, {
      errorMap: (issue, ctx) => {
        if (issue.code === "invalid_enum_value") {
          return { message: "Target type must be one of product_store, service_store, product, or service" };
        }
        return { message: ctx.defaultError };
      },
    }),
  }),
});

const checkIsFavoritedSchema = z.object({
  query: z.object({
    targetId: z.string({
      required_error: "Target ID is required",
    }),
    targetType: z.nativeEnum(FAVORITE_TYPE, {
      errorMap: (issue, ctx) => {
        if (issue.code === "invalid_enum_value") {
          return { message: "Target type must be one of product_store, service_store, product, or service" };
        }
        return { message: ctx.defaultError };
      },
    }),
  }),
});

export const FavoriteValidation = {
  toggleFavoriteSchema,
  checkIsFavoritedSchema,
};
