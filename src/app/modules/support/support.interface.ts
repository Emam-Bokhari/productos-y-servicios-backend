import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { SUPPORT_PRIORITY } from "./support.constant";

export type TSupport = {
  userId: Types.ObjectId;
  name: string;
  email: string;
  subject: string;
  message: string;
  priority?: SUPPORT_PRIORITY;
};

export type SupportModel = ISoftDeleteModel<TSupport>;
