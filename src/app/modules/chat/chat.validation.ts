import { z } from "zod";
import { CHAT_COMMUNICATION_TYPE } from "../../../enums/chat";

const createChatValidationSchema = z.object({
  body: z
    .object({
      participant: z.string().optional(),
      communicationType: z.nativeEnum(CHAT_COMMUNICATION_TYPE).optional(),
      referenceId: z.string().optional(),
    })
    .refine(
      (data) =>
        data.participant ||
        data.communicationType === CHAT_COMMUNICATION_TYPE.SUPPORT,
      {
        message: "Participant ID is required unless creating a support chat",
        path: ["participant"],
      },
    ),
});

export const chatValidation = {
  createChatValidationSchema,
};