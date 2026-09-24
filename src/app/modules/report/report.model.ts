import { Schema, model } from "mongoose";
import { IReport, ReportModel } from "./report.interface";
import {
  REPORT_ACTION_TAKEN,
  REPORT_REASON,
  REPORT_STATUS,
  REPORT_TYPE,
} from "./report.constant";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const reportSchema = new Schema<IReport, ReportModel>(
  {
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportType: {
      type: String,
      enum: Object.values(REPORT_TYPE),
      required: true,
      index: true,
    },
    targetStore: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      default: null,
      index: true,
    },
    targetUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    reason: {
      type: String,
      enum: Object.values(REPORT_REASON),
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUS),
      default: REPORT_STATUS.PENDING,
      index: true,
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true,
    },
    actionTaken: {
      type: String,
      default: REPORT_ACTION_TAKEN.NONE,
      trim: true,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Apply soft delete plugin
reportSchema.plugin(softDeletePlugin);

// Compound indexes for fast admin querying and filtering
reportSchema.index({ reportType: 1, status: 1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });
reportSchema.index({ targetStore: 1, status: 1 });
reportSchema.index({ targetUser: 1, status: 1 });

export const Report = model<IReport, ReportModel>("Report", reportSchema);
