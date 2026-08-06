import express from "express";
import { MessageController } from "./message.controller";
import { USER_ROLES } from "../../../enums/user";
import { FOLDER_NAMES } from "../../../enums/files";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { messageValidation } from "./message.validation";

import { parseFileData } from "../../middlewares/parseFileData";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { isAuthenticated } from "../../../helpers/authHelper";

const router = express.Router();

// Existing routes
router.post(
  "/send-message/:chatId",
  isAuthenticated,
  fileUploadHandler(),
  parseFileData({ fieldName: FOLDER_NAMES.IMAGE, mode: "single" }),
  validateRequest(messageValidation.sendMessageValidationSchema),
  MessageController.sendMessage,
);

router.get("/:chatId", isAuthenticated, MessageController.getMessages);

router.delete(
  "/delete/:messageId",
  isAuthenticated,
  MessageController.deleteMessage,
);

// New route for pin/unpin message
router.patch(
  "/pin-unpin/:messageId",
  isAuthenticated,
  validateRequest(messageValidation.pinUnpinMessageValidationSchema),
  MessageController.pinUnpinMessage,
);

export const MessageRoutes = router;
