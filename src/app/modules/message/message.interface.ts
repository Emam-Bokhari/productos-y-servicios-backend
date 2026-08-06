import { ISoftDeleteModel } from "../../../types/softDelete";
import { Model, Types } from "mongoose";
import { MESSAGE_TYPE } from "../../../enums/message";

export type IMessage = {
  chatId: Types.ObjectId;
  sender: Types.ObjectId;
  text?: string;
  image?: string;
  read: boolean;
  isDeleted: boolean;
  type: MESSAGE_TYPE;
  isPinned: boolean;
  pinnedBy?: Types.ObjectId;
  pinnedAt?: Date;
};

export type MessageModel = ISoftDeleteModel<IMessage>;
