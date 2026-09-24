import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import {
  REPORT_ACTION_TAKEN,
  REPORT_REASON,
  REPORT_STATUS,
  REPORT_TYPE,
} from "./report.constant";

export type IReport = {
  reporterId: Types.ObjectId;
  reportType: REPORT_TYPE;
  targetStore?: Types.ObjectId;
  targetUser?: Types.ObjectId;
  reason: REPORT_REASON;
  description: string;
  images?: string[];
  status: REPORT_STATUS;
  adminNotes?: string;
  actionTaken?: REPORT_ACTION_TAKEN | string;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
};

export type ReportModel = ISoftDeleteModel<IReport>;
