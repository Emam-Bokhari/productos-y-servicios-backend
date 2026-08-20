import { z } from "zod";
import { BROADCAST_AUDIENCE, BROADCAST_CHANNEL } from "./broadcast.constant";

const createBroadcastZodSchema = z.object({
  body: z.object({
    title: z.string({ required_error: "Title is required" }),
    message: z.string({ required_error: "Message is required" }),
    audience: z.nativeEnum(BROADCAST_AUDIENCE, {
      required_error: "Audience is required",
    }),
    channel: z.nativeEnum(BROADCAST_CHANNEL).optional(),
  }),
});

export const BroadcastValidation = {
  createBroadcastZodSchema,
};
