import { socketHelper } from "../../../../helpers/socketHelper";

/**
 * Socket.io events wrapper for the chat and message modules
 */
const emitNewChat = (userId: string, data: any): boolean => {
  return socketHelper.sendToUser(userId, `newChat::${userId}`, data);
};

const emitChatDeleted = (userId: string, data: any): boolean => {
  return socketHelper.sendToUser(userId, `chatDeletedForUser::${userId}`, data);
};

const emitNewMessage = (userId: string, data: any): boolean => {
  return socketHelper.sendToUser(userId, `newMessage::${userId}`, data);
};

const emitUnreadCountUpdate = (userId: string, data: any): boolean => {
  return socketHelper.sendToUser(userId, `unreadCountUpdate::${userId}`, data);
};

const emitChatListUpdate = (userId: string, data: any): boolean => {
  return socketHelper.sendToUser(userId, `chatListUpdate::${userId}`, data);
};

const emitMessagePinned = (userId: string, data: any): boolean => {
  return socketHelper.sendToUser(userId, `messagePinned::${userId}`, data);
};

const emitMessageUnpinned = (userId: string, data: any): boolean => {
  return socketHelper.sendToUser(userId, `messageUnpinned::${userId}`, data);
};

export const chatSocketHelper = {
  emitNewChat,
  emitChatDeleted,
  emitNewMessage,
  emitUnreadCountUpdate,
  emitChatListUpdate,
  emitMessagePinned,
  emitMessageUnpinned,
};
