import express from "express";
import { isAdmin, isAuthenticated } from "../../../helpers/authHelper";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import validateRequest from "../../middlewares/validateRequest";
import { ReportController } from "./report.controller";
import { ReportValidation } from "./report.validation";

const router = express.Router();

/* ---------------------------- MOBILE / APK CLIENT ROUTES ---------------------------- */
// Submit report for store or user (supports optional image attachments)
router.post(
  "/",
  isAuthenticated,
  fileUploadHandler(),
  parseFileData({ fieldName: "images", mode: "multiple" }),
  validateRequest(ReportValidation.createReportSchema),
  ReportController.createReport,
);

// Get available report reason enum options (for mobile app dropdown)
router.get("/reasons", ReportController.getReportReasons);

// Get reports submitted by current logged-in user
router.get("/my-reports", isAuthenticated, ReportController.getMyReports);

/* ---------------------------- ADMIN DASHBOARD ROUTES ---------------------------- */
// Get aggregated report statistics for Admin Dashboard cards
router.get("/stats", isAdmin, ReportController.getReportStats);

// Get all submitted reports with filters, search, and pagination
router.get("/", isAdmin, ReportController.getAllReports);

// Get single report details by ID
router.get("/:id", isAdmin, ReportController.getReportById);

// Update report status (review, resolve, dismiss, take moderation action)
router.patch(
  "/:id",
  isAdmin,
  validateRequest(ReportValidation.updateReportStatusSchema),
  ReportController.updateReportStatus,
);

// Soft delete report
router.delete("/:id", isAdmin, ReportController.deleteReportById);

export const ReportRoutes = router;
