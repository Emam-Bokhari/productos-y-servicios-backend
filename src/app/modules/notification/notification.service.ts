import { JwtPayload } from "jsonwebtoken";
import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { USER_ROLES } from "../../../enums/user";
import { INotification } from "./notification.interface";
import { Notification } from "./notification.model";
import QueryBuilder from "../../builder/queryBuilder";
import { NOTIFICATION_TYPE } from "./notification.constant";

// get notifications (excluding message_new)
const getNotificationFromDB = async (
  user: JwtPayload,
  query: Record<string, unknown>,
) => {
  const filter: Record<string, any> = {
    receiver: user.id,
    type: { $ne: NOTIFICATION_TYPE.MESSAGE_NEW },
  };

  const baseQuery = Notification.find(filter).populate([
    { path: "receiver" },
    { path: "sender" },
    { path: "referenceId" },
  ]);

  const unreadCount = await Notification.countDocuments({
    ...filter,
    read: false,
  });

  const queryBuilder = new QueryBuilder(baseQuery, query).sort().paginate();

  const result = await queryBuilder.modelQuery;

  const meta = await queryBuilder.countTotal();

  return {
    data: result,
    meta: {
      ...meta,
      unreadCount,
    },
  };
};

// read notifications only for user (excluding message_new)
const readNotificationToDB = async (
  user: JwtPayload,
): Promise<INotification | undefined> => {
  const result: any = await Notification.updateMany(
    {
      receiver: user.id,
      read: false,
      type: { $ne: NOTIFICATION_TYPE.MESSAGE_NEW },
    },
    { $set: { read: true } },
  );
  return result;
};

// get recent activities (last 5, excluding message_new)
const getRecentActivitiesFromDB = async (user: JwtPayload) => {
  const result = await Notification.find({
    receiver: user.id,
    type: { $ne: NOTIFICATION_TYPE.MESSAGE_NEW },
  })
    .populate([
      { path: "receiver" },
      { path: "sender" },
      { path: "referenceId" },
    ])
    .sort({ createdAt: -1 })
    .limit(5);

  return result;
};

// get notifications for admin
const adminNotificationFromDB = async (query: any) => {
  const baseQuery = Notification.find({
    type: NOTIFICATION_TYPE.ADMIN,
  }).populate([
    { path: "receiver" },
    { path: "sender" },
    { path: "referenceId" },
  ]);

  const unreadCount = await Notification.countDocuments({
    type: NOTIFICATION_TYPE.ADMIN,
    read: false,
  });

  const queryBuilder = new QueryBuilder(baseQuery, query).sort().paginate();

  const result = await queryBuilder.modelQuery;

  const meta = await queryBuilder.countTotal();

  return {
    data: result,
    meta: {
      ...meta,
      unreadCount,
    },
  };
};

// read notifications only for admin
const adminReadNotificationToDB = async (): Promise<INotification | null> => {
  const result: any = await Notification.updateMany(
    { type: NOTIFICATION_TYPE.ADMIN, read: false },
    { $set: { read: true } },
    { new: true },
  );
  return result;
};

// get recent activities for admin (last 5)
const adminRecentActivitiesFromDB = async () => {
  const result = await Notification.find({ type: NOTIFICATION_TYPE.ADMIN })
    .populate([
      { path: "receiver" },
      { path: "sender" },
      { path: "referenceId" },
    ])
    .sort({ createdAt: -1 })
    .limit(5);

  return result;
};

// get single notification (user)
const getSingleNotificationFromDB = async (
  user: JwtPayload,
  id: string,
): Promise<INotification | null> => {
  const result = await Notification.findOne({
    _id: id,
    receiver: user.id,
  }).populate([
    { path: "receiver" },
    { path: "sender" },
    { path: "referenceId" },
  ]);

  return result;
};

// read single notification (user)
const readSingleNotificationToDB = async (
  user: JwtPayload,
  id: string,
): Promise<INotification | null> => {
  const result = await Notification.findOneAndUpdate(
    { _id: id, receiver: user.id },
    { $set: { read: true } },
    { new: true },
  );

  return result;
};

// admin get single notification
const adminGetSingleNotificationFromDB = async (
  id: string,
): Promise<INotification | null> => {
  const result = await Notification.findOne({
    _id: id,
    type: NOTIFICATION_TYPE.ADMIN,
  }).populate([
    { path: "receiver" },
    { path: "sender" },
    { path: "referenceId" },
  ]);

  return result;
};

// admin read single notification
const adminReadSingleNotificationToDB = async (
  id: string,
): Promise<INotification | null> => {
  const result = await Notification.findOneAndUpdate(
    { _id: id, type: NOTIFICATION_TYPE.ADMIN },
    { $set: { read: true } },
    { new: true },
  );

  return result;
};

// delete single notification (user or admin)
const deleteSingleNotificationFromDB = async (
  user: JwtPayload,
  id: string,
): Promise<INotification | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid notification ID");
  }

  const filter: Record<string, any> = { _id: id };

  // If normal user/seller, restrict deletion to their own notifications
  if (
    user.role !== USER_ROLES.ADMIN &&
    user.role !== USER_ROLES.SUPER_ADMIN
  ) {
    filter.receiver = user.id;
  }

  const notification = await Notification.findOne(filter);

  if (!notification) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Notification not found or you are not authorized to delete it",
    );
  }

  const result = await Notification.softDeleteById(id);
  return result;
};

// delete multiple or all notifications for user (excluding message_new if deleting all)
const deleteNotificationsFromDB = async (
  user: JwtPayload,
  ids?: string[],
) => {
  const filter: Record<string, any> = { receiver: user.id };

  if (ids && Array.isArray(ids) && ids.length > 0) {
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "No valid notification IDs provided",
      );
    }
    filter._id = { $in: validIds };
  } else {
    filter.type = { $ne: NOTIFICATION_TYPE.MESSAGE_NEW };
  }

  const result = await Notification.softDeleteMany(filter);
  return result;
};

// admin delete single notification
const adminDeleteSingleNotificationFromDB = async (
  id: string,
): Promise<INotification | null> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid notification ID");
  }

  const notification = await Notification.findOne({
    _id: id,
    type: NOTIFICATION_TYPE.ADMIN,
  });

  if (!notification) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Admin notification not found");
  }

  const result = await Notification.softDeleteById(id);
  return result;
};

// admin delete multiple or all notifications
const adminDeleteNotificationsFromDB = async (ids?: string[]) => {
  const filter: Record<string, any> = { type: NOTIFICATION_TYPE.ADMIN };

  if (ids && Array.isArray(ids) && ids.length > 0) {
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "No valid notification IDs provided",
      );
    }
    filter._id = { $in: validIds };
  }

  const result = await Notification.softDeleteMany(filter);
  return result;
};

// ================= MESSAGE NOTIFICATIONS (SEPARATE) =================

// get message notifications only (type: message_new)
const getMessageNotificationsFromDB = async (
  user: JwtPayload,
  query: Record<string, unknown>,
) => {
  const filter: Record<string, any> = {
    receiver: user.id,
    type: NOTIFICATION_TYPE.MESSAGE_NEW,
  };

  const baseQuery = Notification.find(filter).populate([
    { path: "receiver" },
    { path: "sender" },
    { path: "referenceId" },
  ]);

  const unreadCount = await Notification.countDocuments({
    ...filter,
    read: false,
  });

  const queryBuilder = new QueryBuilder(baseQuery, query).sort().paginate();

  const result = await queryBuilder.modelQuery;

  const meta = await queryBuilder.countTotal();

  return {
    data: result,
    meta: {
      ...meta,
      unreadCount,
    },
  };
};

// read all message notifications for user
const readMessageNotificationsToDB = async (user: JwtPayload) => {
  const result: any = await Notification.updateMany(
    {
      receiver: user.id,
      read: false,
      type: NOTIFICATION_TYPE.MESSAGE_NEW,
    },
    { $set: { read: true } },
  );
  return result;
};

// delete all or selected message notifications for user
const deleteMessageNotificationsFromDB = async (
  user: JwtPayload,
  ids?: string[],
) => {
  const filter: Record<string, any> = {
    receiver: user.id,
    type: NOTIFICATION_TYPE.MESSAGE_NEW,
  };

  if (ids && Array.isArray(ids) && ids.length > 0) {
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "No valid notification IDs provided",
      );
    }
    filter._id = { $in: validIds };
  }

  const result = await Notification.softDeleteMany(filter);
  return result;
};

export const NotificationService = {
  adminNotificationFromDB,
  getNotificationFromDB,
  readNotificationToDB,
  adminReadNotificationToDB,
  getRecentActivitiesFromDB,
  adminRecentActivitiesFromDB,
  getSingleNotificationFromDB,
  readSingleNotificationToDB,
  adminGetSingleNotificationFromDB,
  adminReadSingleNotificationToDB,
  deleteSingleNotificationFromDB,
  deleteNotificationsFromDB,
  adminDeleteSingleNotificationFromDB,
  adminDeleteNotificationsFromDB,
  getMessageNotificationsFromDB,
  readMessageNotificationsToDB,
  deleteMessageNotificationsFromDB,
};