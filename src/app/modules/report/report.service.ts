import { Types } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import QueryBuilder from "../../builder/queryBuilder";
import { User } from "../user/user.model";
import { Store } from "../store/store.model";
import { STORE_STATUS } from "../store/store.constant";
import { STATUS } from "../../../enums/user";
import { Report } from "./report.model";
import {
  REPORT_ACTION_TAKEN,
  REPORT_SEARCHABLE_FIELDS,
  REPORT_STATUS,
  REPORT_TYPE,
} from "./report.constant";
import { IReport } from "./report.interface";

const createReportInDB = async (
  reporterId: string,
  payload: Partial<IReport> & {
    targetStore?: string | Types.ObjectId;
    targetUser?: string | Types.ObjectId;
  },
) => {
  // 1. Verify reporter exists and is active
  const reporter = await User.findById(reporterId);
  if (!reporter) {
    throw new ApiError(404, "Reporter user not found");
  }
  if (reporter.status === STATUS.INACTIVE) {
    throw new ApiError(403, "Your account is inactive. You cannot submit reports.");
  }

  // 2. Validate target based on reportType
  if (payload.reportType === REPORT_TYPE.STORE) {
    const storeId = payload.targetStore?.toString();
    if (!storeId) {
      throw new ApiError(400, "targetStore is required when reporting a store");
    }

    const store = await Store.findById(storeId);
    if (!store) {
      throw new ApiError(404, "Store to report not found");
    }

    if (store.owner.toString() === reporterId) {
      throw new ApiError(400, "You cannot report your own store");
    }

    // Check for duplicate pending report
    const existingReport = await Report.findOne({
      reporterId: new Types.ObjectId(reporterId),
      targetStore: new Types.ObjectId(storeId),
      status: { $in: [REPORT_STATUS.PENDING, REPORT_STATUS.UNDER_REVIEW] },
    });

    if (existingReport) {
      throw new ApiError(
        400,
        "You have already submitted a report for this store that is currently under review.",
      );
    }

    payload.targetStore = new Types.ObjectId(storeId);
    payload.targetUser = undefined;
  } else if (payload.reportType === REPORT_TYPE.USER) {
    const targetUserId = payload.targetUser?.toString();
    if (!targetUserId) {
      throw new ApiError(400, "targetUser is required when reporting a user");
    }

    if (targetUserId === reporterId) {
      throw new ApiError(400, "You cannot report yourself");
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      throw new ApiError(404, "User to report not found");
    }

    // Check for duplicate pending report
    const existingReport = await Report.findOne({
      reporterId: new Types.ObjectId(reporterId),
      targetUser: new Types.ObjectId(targetUserId),
      status: { $in: [REPORT_STATUS.PENDING, REPORT_STATUS.UNDER_REVIEW] },
    });

    if (existingReport) {
      throw new ApiError(
        400,
        "You have already submitted a report for this user that is currently under review.",
      );
    }

    payload.targetUser = new Types.ObjectId(targetUserId);
    payload.targetStore = undefined;
  } else {
    throw new ApiError(400, "Invalid reportType. Must be 'store' or 'user'");
  }

  // 3. Ensure images is an array of strings
  if (payload.images && !Array.isArray(payload.images)) {
    payload.images = [payload.images as unknown as string];
  }

  payload.reporterId = new Types.ObjectId(reporterId);
  payload.status = REPORT_STATUS.PENDING;
  payload.actionTaken = REPORT_ACTION_TAKEN.NONE;

  const result = await Report.create(payload);

  return await Report.findById(result._id)
    .populate({
      path: "reporterId",
      select: "name email profileImage role phone",
    })
    .populate({
      path: "targetStore",
      select: "displayName storeType logo coverImage status",
    })
    .populate({
      path: "targetUser",
      select: "name email profileImage role status",
    });
};

const getMyReportsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const baseQuery = Report.find({ reporterId: new Types.ObjectId(userId) })
    .populate({
      path: "targetStore",
      select: "displayName storeType logo coverImage status",
    })
    .populate({
      path: "targetUser",
      select: "name email profileImage role status",
    });

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(REPORT_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [reports, meta] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
  ]);

  return {
    data: reports,
    meta,
  };
};

const getAllReportsFromDB = async (query: Record<string, unknown>) => {
  const baseQuery = Report.find()
    .populate({
      path: "reporterId",
      select: "name email profileImage role phone status",
    })
    .populate({
      path: "targetStore",
      select: "displayName storeType logo coverImage status owner streetAddress city",
    })
    .populate({
      path: "targetUser",
      select: "name email profileImage role status phone",
    })
    .populate({
      path: "resolvedBy",
      select: "name email profileImage role",
    });

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(REPORT_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const [reports, meta, counts] = await Promise.all([
    queryBuilder.modelQuery.lean(),
    queryBuilder.countTotal(),
    Report.aggregate([
      {
        $facet: {
          byStatus: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ],
          byType: [
            {
              $group: {
                _id: "$reportType",
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),
  ]);

  const summary = {
    total: meta.total,
    pending: 0,
    under_review: 0,
    resolved: 0,
    dismissed: 0,
    storeReports: 0,
    userReports: 0,
  };

  if (counts.length > 0) {
    const { byStatus, byType } = counts[0];
    byStatus?.forEach((item: { _id: string; count: number }) => {
      if (item._id === REPORT_STATUS.PENDING) summary.pending = item.count;
      if (item._id === REPORT_STATUS.UNDER_REVIEW)
        summary.under_review = item.count;
      if (item._id === REPORT_STATUS.RESOLVED) summary.resolved = item.count;
      if (item._id === REPORT_STATUS.DISMISSED) summary.dismissed = item.count;
    });

    byType?.forEach((item: { _id: string; count: number }) => {
      if (item._id === REPORT_TYPE.STORE) summary.storeReports = item.count;
      if (item._id === REPORT_TYPE.USER) summary.userReports = item.count;
    });
  }

  return {
    data: reports,
    meta,
    summary,
  };
};

const getReportByIdFromDB = async (id: string) => {
  const report = await Report.findById(id)
    .populate({
      path: "reporterId",
      select: "name email profileImage role phone status createdAt",
    })
    .populate({
      path: "targetStore",
      select:
        "displayName storeType logo coverImage status owner streetAddress city canton sector country phone email averageRating ratingCount isVerified",
      populate: {
        path: "owner",
        select: "name email phone profileImage status",
      },
    })
    .populate({
      path: "targetUser",
      select: "name email profileImage role status phone createdAt isVerified",
    })
    .populate({
      path: "resolvedBy",
      select: "name email profileImage role",
    });

  if (!report) {
    throw new ApiError(404, "Report not found");
  }

  return report;
};

const updateReportStatusInDB = async (
  adminId: string,
  id: string,
  payload: {
    status: REPORT_STATUS;
    adminNotes?: string;
    actionTaken?: string;
    applyTargetAction?:
      | "none"
      | "suspend_store"
      | "activate_store"
      | "block_user"
      | "unblock_user";
  },
) => {
  const report = await Report.findById(id);
  if (!report) {
    throw new ApiError(404, "Report not found");
  }

  report.status = payload.status;

  if (payload.adminNotes !== undefined) {
    report.adminNotes = payload.adminNotes;
  }

  if (payload.actionTaken !== undefined) {
    report.actionTaken = payload.actionTaken;
  }

  if (
    payload.status === REPORT_STATUS.RESOLVED ||
    payload.status === REPORT_STATUS.DISMISSED
  ) {
    report.resolvedBy = new Types.ObjectId(adminId);
    report.resolvedAt = new Date();
  }

  // Handle direct target moderation action if requested by admin from Dashboard
  if (payload.applyTargetAction && payload.applyTargetAction !== "none") {
    if (
      payload.applyTargetAction === "suspend_store" &&
      report.targetStore
    ) {
      await Store.findByIdAndUpdate(report.targetStore, {
        status: STORE_STATUS.SUSPENDED,
      });
      if (!payload.actionTaken) {
        report.actionTaken = REPORT_ACTION_TAKEN.STORE_SUSPENDED;
      }
    } else if (
      payload.applyTargetAction === "activate_store" &&
      report.targetStore
    ) {
      await Store.findByIdAndUpdate(report.targetStore, {
        status: STORE_STATUS.ACTIVE,
      });
    } else if (
      payload.applyTargetAction === "block_user" &&
      report.targetUser
    ) {
      await User.findByIdAndUpdate(report.targetUser, {
        status: STATUS.INACTIVE,
      });
      if (!payload.actionTaken) {
        report.actionTaken = REPORT_ACTION_TAKEN.USER_BLOCKED;
      }
    } else if (
      payload.applyTargetAction === "unblock_user" &&
      report.targetUser
    ) {
      await User.findByIdAndUpdate(report.targetUser, {
        status: STATUS.ACTIVE,
      });
    }
  }

  await report.save();

  return await getReportByIdFromDB(id);
};

const deleteReportByIdFromDB = async (id: string) => {
  const result = await Report.softDeleteById(id);
  if (!result) {
    throw new ApiError(404, "Report not found or already deleted");
  }
  return result;
};

const getReportStatsFromDB = async () => {
  const [
    totalReports,
    pendingReports,
    underReviewReports,
    resolvedReports,
    dismissedReports,
    storeReportsCount,
    userReportsCount,
    recentReports,
  ] = await Promise.all([
    Report.countDocuments({}),
    Report.countDocuments({ status: REPORT_STATUS.PENDING }),
    Report.countDocuments({ status: REPORT_STATUS.UNDER_REVIEW }),
    Report.countDocuments({ status: REPORT_STATUS.RESOLVED }),
    Report.countDocuments({ status: REPORT_STATUS.DISMISSED }),
    Report.countDocuments({ reportType: REPORT_TYPE.STORE }),
    Report.countDocuments({ reportType: REPORT_TYPE.USER }),
    Report.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate({
        path: "reporterId",
        select: "name email profileImage",
      })
      .populate({
        path: "targetStore",
        select: "displayName logo storeType",
      })
      .populate({
        path: "targetUser",
        select: "name email profileImage",
      })
      .lean(),
  ]);

  return {
    totalReports,
    pendingReports,
    underReviewReports,
    resolvedReports,
    dismissedReports,
    storeReportsCount,
    userReportsCount,
    recentReports,
  };
};

export const ReportService = {
  createReportInDB,
  getMyReportsFromDB,
  getAllReportsFromDB,
  getReportByIdFromDB,
  updateReportStatusInDB,
  deleteReportByIdFromDB,
  getReportStatsFromDB,
};
