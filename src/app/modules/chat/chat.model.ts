import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import mongoose, { Schema } from "mongoose";
import { IChat, ChatModel } from "./chat.interface";
import { CHAT_COMMUNICATION_TYPE, CHAT_STATUS } from "../../../enums/chat";

const chatSchema = new Schema<IChat, ChatModel>(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    lastMessage: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    read: {
      type: Boolean,
      default: false,
    },
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    deletedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isDeleted: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(CHAT_STATUS),
      default: CHAT_STATUS.ACTIVE,
    },
    pinnedMessages: [{ type: Schema.Types.ObjectId, ref: "Message" }],
    communicationType: {
      type: String,
      enum: Object.values(CHAT_COMMUNICATION_TYPE),
      default: CHAT_COMMUNICATION_TYPE.OTHER,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

chatSchema.plugin(softDeletePlugin);

export const Chat = mongoose.model<IChat, ChatModel>("Chat", chatSchema);
