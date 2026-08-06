import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { ChatService } from "./chat.service";
import ApiError from "../../../errors/ApiErrors";
import { CHAT_COMMUNICATION_TYPE } from "../../../enums/chat";
import { chatPermissionHelper } from "./helpers/chatPermission.helper";

const createChat = catchAsync(async (req, res) => {
  const { participant, communicationType, referenceId } = req.body;
  const { id: userId }: any = req.user;
  const participants = [userId, participant];

  // Validate contextual permission if a specific type is provided
  if (
    communicationType &&
    communicationType !== CHAT_COMMUNICATION_TYPE.OTHER
  ) {
    const permission = await chatPermissionHelper.checkChatPermission(
      userId,
      participant,
      communicationType,
      referenceId,
    );
    if (!permission.allowed) {
      throw new ApiError(403, permission.reason);
    }
  }

  const result = await ChatService.createChatIntoDB(
    participants,
    communicationType,
    referenceId,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Chat created successfully",
    data: result,
  });
});

const markChatAsRead = catchAsync(async (req, res) => {
  const { id } = req.params;
  const user: any = req?.user;

  const result = await ChatService.markChatAsRead(user.id, id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Chat marked as read",
    data: result,
  });
});

const getChats = catchAsync(async (req, res) => {
  const { id: userId }: any = req.user;
  const result = await ChatService.getAllChatsFromDB(userId, req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Chats retrieved successfully",
    data: {
      chats: result.data,
      unreadChatsCount: result.unreadChatsCount,
      totalUnreadMessages: result.totalUnreadMessages,
    },
    meta: result.meta,
  });
});

const getChatImages = catchAsync(async (req, res) => {
  const { id: userId } = req.user as any;
  const { chatId } = req.params;

  const result = await ChatService.getChatImagesFromDB(chatId, userId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Chat images retrieved successfully",
    data: result,
  });
});

const deleteChat = catchAsync(async (req, res) => {
  const { id: userId }: any = req.user;
  const { chatId } = req.params;
  const result = await ChatService.softDeleteChatForUser(chatId, userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Chat deleted successfully",
    data: result,
  });
});

export const ChatController = {
  createChat,
  getChats,
  markChatAsRead,
  deleteChat,
  getChatImages,
};
