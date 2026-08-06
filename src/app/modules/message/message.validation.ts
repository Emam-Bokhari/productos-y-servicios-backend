import { z } from "zod";

const sendMessageValidationSchema = z.object({
  body: z
    .object({
      text: z.string().optional(),
      image: z.string().optional(),
    })
    .refine((data) => data.text || data.image, {
      message: "Either text or image must be provided",
      path: ["text"],
    }),
});

const pinUnpinMessageValidationSchema = z.object({
  body: z.object({
    action: z.enum(["pin", "unpin"], {
      required_error: "action is required and must be 'pin' or 'unpin'",
    }),
  }),
});

export const messageValidation = {
  sendMessageValidationSchema,
  pinUnpinMessageValidationSchema,
};
