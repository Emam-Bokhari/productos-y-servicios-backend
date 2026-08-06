import { z } from "zod";
import { CHAT_COMMUNICATION_TYPE } from "../../../enums/chat";

const createChatValidationSchema = z.object({
  body: z.object({
    participant: z.string({
      required_error: "participant ID is required",
    }),
    communicationType: z.nativeEnum(CHAT_COMMUNICATION_TYPE).optional(),
    referenceId: z.string().optional(),
  }),
});

export const chatValidation = {
  createChatValidationSchema,
};
