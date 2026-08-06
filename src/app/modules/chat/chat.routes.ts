import { Router } from "express";
import { ChatController } from "./chat.controller";
import { USER_ROLES } from "../../../enums/user";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { chatValidation } from "./chat.validation";

const router = Router();

router.get(
  "/",
  auth(
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.USER,
    USER_ROLES.SELLER,
  ),
  ChatController.getChats,
);

router.get(
  "/:chatId/images",
  auth(
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.USER,
    USER_ROLES.SELLER,
  ),
  ChatController.getChatImages,
);

router.post(
  "/create-chat",
  auth(
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.USER,
    USER_ROLES.SELLER,
  ),
  validateRequest(chatValidation.createChatValidationSchema),
  ChatController.createChat,
);

router.patch(
  "/mark-chat-as-read/:id",
  auth(
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.USER,
    USER_ROLES.SELLER,
  ),
  ChatController.markChatAsRead,
);

router.delete(
  "/delete/:chatId",
  auth(
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.USER,
    USER_ROLES.SELLER,
  ),
  ChatController.deleteChat,
);

export const ChatRoutes = router;
