import { ISoftDeleteModel } from "../../../types/softDelete";
import { Types } from "mongoose";
import {
  BROADCAST_AUDIENCE,
  BROADCAST_CHANNEL,
  BROADCAST_STATUS,
} from "./broadcast.constant";

export interface IBroadcast {
  title: string;
  message: string;
  audience: BROADCAST_AUDIENCE;
  channel: BROADCAST_CHANNEL;
  status: BROADCAST_STATUS;
  sentAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type BroadcastModel = ISoftDeleteModel<IBroadcast>;
