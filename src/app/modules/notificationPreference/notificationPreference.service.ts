import { JwtPayload } from "jsonwebtoken";
import { INotificationPreference } from "./notificationPreference.interface";
import { NotificationPreference } from "./notificationPreference.model";

// get notification preference by user
const getNotificationPreferenceByUser = async (
  user: JwtPayload,
): Promise<INotificationPreference | null> => {
  const result = await NotificationPreference.findOne({ userId: user.id });
  return result;
};

// update notification preference (creates if not exists)
const updateNotificationPreference = async (
  user: JwtPayload,
  payload: Partial<INotificationPreference>,
): Promise<INotificationPreference | null> => {
  const result = await NotificationPreference.findOneAndUpdate(
    { userId: user.id },
    { $set: payload },
    { upsert: true, new: true },
  );
  return result;
};

// delete notification preference
const deleteNotificationPreference = async (
  user: JwtPayload,
): Promise<INotificationPreference | null> => {
  const result = await NotificationPreference.findOneAndUpdate(
    { userId: user.id },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
  return result;
};

export const NotificationPreferenceService = {
  getNotificationPreferenceByUser,
  updateNotificationPreference,
  deleteNotificationPreference,
};
