import { z } from "zod";
import { FAVORITE_TYPE } from "../../../enums/favorite";

const toggleFavoriteSchema = z.object({
  body: z.object({
    targetId: z.string({
      required_error: "Target ID is required",
    }),
    targetType: z.nativeEnum(FAVORITE_TYPE, {
      required_error: "Target type must be one of Store, Product, or Service",
    }),
  }),
});

export const FavoriteValidation = {
  toggleFavoriteSchema,
};
 