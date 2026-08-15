import { ISoftDeleteModel } from "../../../types/softDelete";
import { Model, Types } from "mongoose";

export type INotification = {
  title: string;
  text: string;
  receiver?: Types.ObjectId | string;
  sender?: Types.ObjectId | string;
  read: boolean;
  referenceId?: Types.ObjectId | string;
  referenceModel?:
    | "Store"
    | "Product"
    | "Service"
    | "Advertisement"
    | "Review"
    | "User"
    | "Subscription"
    | "Transaction"
    | "Support"
    | "Chat"
    | "Message";
  type?: string;
};

export type NotificationModel = ISoftDeleteModel<INotification>;
