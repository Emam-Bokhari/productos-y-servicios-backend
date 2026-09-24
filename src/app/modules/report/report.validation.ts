import { z } from "zod";
import {
  REPORT_ACTION_TAKEN,
  REPORT_REASON,
  REPORT_STATUS,
  REPORT_TYPE,
} from "./report.constant";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createReportSchema = z.object({
  body: z
    .object({
      reportType: z.nativeEnum(REPORT_TYPE, {
        required_error: "Report type ('store' or 'user') is required",
      }),
      targetStore: z.string().optional(),
      targetUser: z.string().optional(),
      reason: z.nativeEnum(REPORT_REASON, {
        required_error: "Reason is required",
        invalid_type_error: `Reason must be one of: ${Object.values(REPORT_REASON).join(", ")}`,
      }),
      description: z
        .string({
          required_error: "Description is required",
        })
        .min(5, "Description must be at least 5 characters long"),
      images: z.array(z.string()).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.reportType === REPORT_TYPE.STORE) {
        if (!data.targetStore) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "targetStore is required when reportType is 'store'",
            path: ["targetStore"],
          });
        } else if (!objectIdRegex.test(data.targetStore)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid targetStore ID format",
            path: ["targetStore"],
          });
        }
      }

      if (data.reportType === REPORT_TYPE.USER) {
        if (!data.targetUser) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "targetUser is required when reportType is 'user'",
            path: ["targetUser"],
          });
        } else if (!objectIdRegex.test(data.targetUser)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid targetUser ID format",
            path: ["targetUser"],
          });
        }
      }
    }),
});

const updateReportStatusSchema = z.object({
  body: z.object({
    status: z.nativeEnum(REPORT_STATUS, {
      required_error: "Status is required",
    }),
    adminNotes: z.string().optional(),
    actionTaken: z.string().optional(),
    applyTargetAction: z
      .enum([
        "none",
        "suspend_store",
        "activate_store",
        "block_user",
        "unblock_user",
      ])
      .optional(),
  }),
});

export const ReportValidation = {
  createReportSchema,
  updateReportStatusSchema,
};
