import { z } from "zod";

const createReviewSchema = z.object({
  body: z.object({
    storeId: z
      .string({
        required_error: "Store ID is required",
      })
      .refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
        message: "Invalid Store ID format",
      }),
    rating: z
      .number({
        required_error: "Rating is required",
      })
      .min(1, "Rating must be at least 1")
      .max(5, "Rating cannot be more than 5"),
    comment: z.string({
      required_error: "Comment is required",
    }),
  }),
});

const ownerReplySchema = z.object({
  body: z.object({
    comment: z.string({
      required_error: "Reply comment is required",
    }),
  }),
});

const userReplySchema = z.object({
  body: z.object({
    comment: z.string({
      required_error: "Reply comment is required",
    }),
  }),
});

export const ReviewValidation = {
  createReviewSchema,
  ownerReplySchema,
  userReplySchema,
};
