import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";
import { Schema, model } from "mongoose";
import { IMessage, MessageModel } from "./message.interface";
import { MESSAGE_TYPE } from "../../../enums/message";

const messageSchema = new Schema<IMessage, MessageModel>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Chat",
    },
    sender: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    text: {
      type: String,
    },
    image: {
      type: String,
      default: "",
    },
    read: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: Object.values(MESSAGE_TYPE),
      default: MESSAGE_TYPE.TEXT,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      required: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    pinnedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    pinnedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

messageSchema.plugin(softDeletePlugin);

export const Message = model<IMessage, MessageModel>("Message", messageSchema);
