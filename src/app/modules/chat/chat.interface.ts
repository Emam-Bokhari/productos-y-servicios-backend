import { ISoftDeleteModel } from "../../../types/softDelete";
import { Types } from "mongoose";
import { CHAT_COMMUNICATION_TYPE, CHAT_STATUS } from "../../../enums/chat";

export type IChat = {
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId | null;
  read?: boolean;
  readBy: Types.ObjectId[];
  deletedBy: Types.ObjectId[];
  isDeleted: boolean;
  status: CHAT_STATUS;
  pinnedMessages: Types.ObjectId[]; // Pinned message IDs
  communicationType?: CHAT_COMMUNICATION_TYPE;
  referenceId?: Types.ObjectId;
};

export type ChatModel = ISoftDeleteModel<IChat>;
