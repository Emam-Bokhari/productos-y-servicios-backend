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
    | "Car"
    | "Review"
    | "User"
    | "Ride"
    | "Wallet"
    | "Payout"
    | "LostFound";
  type?: string;
};

export type NotificationModel = ISoftDeleteModel<INotification>;
