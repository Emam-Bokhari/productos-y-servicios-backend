import { Chat } from "./chat.model";
import mongoose from "mongoose";
import { User } from "../user/user.model";
import { Message } from "../message/message.model";
import ApiError from "../../../errors/ApiErrors";
import { CHAT_COMMUNICATION_TYPE } from "../../../enums/chat";
import { MESSAGE_TYPE } from "../../../enums/message";
import { chatSocketHelper } from "./socket/chat.socket";

const createChatIntoDB = async (
  participants: string[],
  communicationType?: CHAT_COMMUNICATION_TYPE,
  referenceId?: string,
) => {
  const query: any = {
    participants: { $all: participants },
    isDeleted: { $ne: true },
  };

  if (communicationType) {
    query.communicationType = communicationType;
  }
  if (referenceId) {
    query.referenceId = referenceId;
  }

  const isExistChat = await Chat.findOne(query);

  if (isExistChat) {
    return isExistChat;
  }
  const newChat = await Chat.create({
    participants: participants,
    lastMessage: null,
    communicationType: communicationType || CHAT_COMMUNICATION_TYPE.OTHER,
    referenceId: referenceId
      ? new mongoose.Types.ObjectId(referenceId)
      : undefined,
  });
  if (!newChat) {
    throw new Error("Failed to create chat");
  }

  newChat.participants.forEach((participant) => {
    chatSocketHelper.emitNewChat(participant.toString(), newChat);
  });
  return newChat;
};

const markChatAsRead = async (userId: string, chatId: string) => {
  return Chat.findByIdAndUpdate(
    chatId,
    { $addToSet: { readBy: userId } },
    { new: true },
  );
};

// 5. Updated getAllChatsFromDB with better unread count calculation
const getAllChatsFromDB = async (
  userId: string,
  query: Record<string, any>,
) => {
  const searchTerm = query.searchTerm?.toLowerCase();
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  const chatQuery = {
    participants: { $in: [userId] },
    deletedBy: { $ne: userId },
    isDeleted: { $ne: true }, // new field
  };

  let chats;
  let totalChats;

  if (searchTerm) {
    const allChats = await Chat.find(chatQuery)
      .populate("lastMessage")
      .lean()
      .sort({ updatedAt: -1 });

    const allChatLists = await Promise.all(
      allChats.map(async (chat) => {
        const otherParticipantIds = chat.participants.filter(
          (participantId) => participantId.toString() !== userId,
        );

        const otherParticipants = await User.find({
          _id: { $in: otherParticipantIds },
        })
          .select("_id firstName lastName profileImage email role")
          .lean();

        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          sender: { $ne: userId },
          read: false,
          isDeleted: false,
        });

        return {
          ...chat,
          participants: otherParticipants,
          isRead: unreadCount === 0, // Chat is read if no unread messages
          unreadCount,
        };
      }),
    );

    const filteredChats = allChatLists.filter((chat) => {
      return chat.participants.some((participant) =>
        participant.name.toLowerCase().includes(searchTerm),
      );
    });

    totalChats = filteredChats.length;
    chats = filteredChats.slice(skip, skip + limit);
  } else {
    totalChats = await Chat.countDocuments(chatQuery);

    const rawChats = await Chat.find(chatQuery)
      .populate("lastMessage")
      .lean()
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    chats = await Promise.all(
      rawChats.map(async (chat) => {
        // const otherParticipantIds = chat.participants.filter((participantId) => participantId.toString() !== userId);

        const otherParticipantIds = chat.participants.filter(
          (participantId) =>
            participantId && participantId.toString() !== userId,
        );

        const otherParticipants = await User.find({
          _id: { $in: otherParticipantIds },
        })
          .select("_id firstName lastName profileImage email role")
          .lean();

        // FIXED: Same unread count calculation
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          sender: { $ne: userId },
          read: false,
          isDeleted: false,
        });

        return {
          ...chat,
          participants: otherParticipants,
          isRead: unreadCount === 0,
          unreadCount,
        };
      }),
    );
  }

  const unreadChatsCount = chats.filter((chat) => chat.unreadCount > 0).length;
  const totalUnreadMessages = chats.reduce(
    (total, chat) => total + chat.unreadCount,
    0,
  );

  const totalPage = Math.ceil(totalChats / limit);

  return {
    data: chats,
    unreadChatsCount,
    totalUnreadMessages,
    meta: {
      limit,
      page,
      total: totalChats,
      totalPage,
    },
  };
};

const getChatImagesFromDB = async (chatId: string, userId: string) => {
  // check chat existence
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(404, "Chat not found");
  }

  // verify user is participant
  const isParticipant = chat.participants.some(
    (p: any) => p.toString() === userId.toString(),
  );
  if (!isParticipant) {
    throw new ApiError(403, "You are not a participant in this chat");
  }

  // ========================GET IMAGES DATA=======================
  const images = await Message.find({
    chatId,
    sender: userId,
    isDeleted: { $ne: true },
    $or: [{ type: MESSAGE_TYPE.IMAGE }, { type: MESSAGE_TYPE.BOTH }],
  })
    .sort({ createdAt: -1 })
    .select("image -_id")
    .lean();

  // return only image URLs as array
  return images.map((msg) => msg.image);
};

const softDeleteChatForUser = async (chatId: string, id: string) => {
  const userId = new mongoose.Types.ObjectId(id);
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(404, "Chat not found");
  }

  if (!chat.participants.some((id) => id.toString() === userId.toString())) {
    throw new ApiError(401, "User is not authorized");
  }

  // If already deleted by this user, just return
  if (chat.deletedBy.some((id) => id.toString() === userId.toString())) {
    return chat;
  }

  // Add userId to deletedBy array
  chat.deletedBy.push(userId);

  // Optional: If all participants deleted, mark status deleted (soft delete for everyone)
  if (chat.deletedBy.length === chat.participants.length) {
    chat.isDeleted = true;
  }

  await chat.save();

  chat.participants.forEach((participant) => {
    chatSocketHelper.emitChatDeleted(participant.toString(), {
      chatId,
      userId,
    });
  });

  return chat;
};

export const ChatService = {
  createChatIntoDB,
  getAllChatsFromDB,
  markChatAsRead,
  softDeleteChatForUser,
  getChatImagesFromDB,
};
