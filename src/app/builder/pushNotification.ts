import mongoose from "mongoose";
import { User } from "../modules/user/user.model";
import { Notification } from "../modules/notification/notification.model";
import { logger } from "../../shared/logger";
import colors from "colors";
import { DeviceToken } from "../modules/fcmToken/fcmToken.model";
import { firebaseAdmin } from "../../config/firebase";
import { NOTIFICATION_TYPE } from "../modules/notification/notification.constant";
import { NotificationPreference } from "../modules/notificationPreference/notificationPreference.model";
import { emailHelper } from "../../helpers/emailHelper";
import { emailTemplate } from "../../shared/emailTemplate";

// 1. Define the Payload Interface (Type Safety)
export interface INotificationPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, string>;
}

class NotificationHelper {
  /**
   * 🟢 MAIN METHOD: SEND TO SINGLE USER
   * Usage: notificationHelper.sendToUser(userId, payload);
   */
  async sendToUser(
    userId: string | mongoose.Types.ObjectId,
    payload: INotificationPayload,
  ) {
    return this.sendToBatch([userId], payload);
  }

  /**
   * 🔵 MAIN METHOD: SEND TO MULTIPLE USERS
   * Usage: notificationHelper.sendToBatch([id1, id2, id3], payload);
   */
  async sendToBatch(
    userIds: (string | mongoose.Types.ObjectId)[],
    payload: INotificationPayload,
  ) {
    try {
      if (!userIds.length) return;

      // 1. Filter Users: Only get users who exist and are active
      const validUsers = await User.find({
        _id: { $in: userIds },
        status: "active",
      })
        .select("_id email")
        .lean();

      const validUserIds = validUsers.map((u) => u._id);

      if (validUserIds.length === 0) return;

      // 2. Fetch Notification Preferences for these users
      const preferences = await NotificationPreference.find({
        userId: { $in: validUserIds },
      }).lean();

      const prefMap = new Map<string, any>();
      preferences.forEach((p) => {
        prefMap.set(p.userId.toString(), p);
      });

      const prefTypeMap: Record<string, string> = {
        [NOTIFICATION_TYPE.MESSAGE_NEW]: "chatMessages",
        [NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE]: "subscriptionUpdates",
        [NOTIFICATION_TYPE.ADVERTISEMENT_UPDATE]: "advertisementUpdates",
        [NOTIFICATION_TYPE.REVIEW_UPDATE]: "reviewUpdates",
      };

      const preferenceKey = prefTypeMap[payload.type];

      // 3. Filter users based on preference configurations
      const dbSaveUserIds: mongoose.Types.ObjectId[] = [];
      const pushUserIds: mongoose.Types.ObjectId[] = [];
      const emailUsers: typeof validUsers = [];

      for (const user of validUsers) {
        const uIdStr = user._id.toString();
        const userPref = prefMap.get(uIdStr);

        // If preference key exists, check if user disabled this event
        if (preferenceKey && userPref && userPref[preferenceKey] === false) {
          continue; // Opted out of this event type completely
        }

        // Always save to Database if event is not disabled
        dbSaveUserIds.push(user._id);

        // Check channel preferences: push (default to true)
        if (!userPref || userPref.push !== false) {
          pushUserIds.push(user._id);
        }

        // Check channel preferences: email (default to true)
        // We only send emails for non-chat events (i.e. not MESSAGE_NEW)
        if (
          payload.type !== NOTIFICATION_TYPE.MESSAGE_NEW &&
          (!userPref || userPref.email !== false)
        ) {
          emailUsers.push(user);
        }
      }

      // 4. Fetch FCM Tokens for users with push enabled
      let fcmTokens: string[] = [];
      if (pushUserIds.length > 0) {
        const tokensData = await DeviceToken.find({
          userId: { $in: pushUserIds },
          fcmToken: { $exists: true, $ne: "" },
        })
          .select("fcmToken")
          .lean();

        fcmTokens = tokensData.map((t) => t.fcmToken);
      }

      // --- PARALLEL EXECUTION START ---
      const tasks = [];

      // TASK A: Send Push Notifications (only if tokens exist)
      if (fcmTokens.length > 0) {
        tasks.push(this.sendToFCM(fcmTokens, payload));
      }

      // TASK B: Save to Database
      if (dbSaveUserIds.length > 0) {
        tasks.push(this.saveToDatabase(dbSaveUserIds, payload));
      }

      // TASK C: Send Email Notifications
      if (emailUsers.length > 0) {
        tasks.push(this.sendToEmail(emailUsers, payload));
      }

      await Promise.allSettled(tasks);
      // --- PARALLEL EXECUTION END ---

      logger.info(
        colors.green(
          `✅ Notification flow completed. DB save: ${dbSaveUserIds.length}, Push: ${pushUserIds.length}, Email: ${emailUsers.length}`,
        ),
      );
    } catch (error) {
      logger.error(colors.red("❌ NotificationHelper Error:"), error);
    }
  }

  /**
   * 🟠 SEND CHAT MESSAGE NOTIFICATION
   */
  async sendChatMessage(chat: any, message: any) {
    try {
      const senderId = message.sender._id.toString();
      const senderName =
        message.sender.name ||
        `${message.sender.firstName || ""} ${message.sender.lastName || ""}`.trim() ||
        "User";

      // message format body
      let bodyText = message.text;
      if (message.isDeleted) bodyText = "This message was deleted";
      if (!bodyText && message.productId)
        bodyText = "Sent a product attachment";
      if (!bodyText) bodyText = "Sent a new message";

      // Remove sender from recipients
      const recipients = chat.participants
        .filter((p: any) => {
          const pId = p._id ? p._id.toString() : p.toString();
          return pId !== senderId;
        })
        .map((p: any) => p._id || p);

      if (recipients.length === 0) return;

      await this.sendToBatch(recipients, {
        title: senderName,
        body: bodyText.substring(0, 100),
        type: NOTIFICATION_TYPE.MESSAGE_NEW,
        data: {
          type: NOTIFICATION_TYPE.MESSAGE_NEW,
          chatId: chat._id.toString(),
          messageId: message._id.toString(),
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      });
    } catch (error) {
      logger.error(colors.red("❌ Error inside sendChatMessage:"), error);
    }
  }

  /**
   * 🔒 PRIVATE: Handle Firebase Logic & Token Cleanup
   * Chunks tokens into batches of 500 (Firebase limit)
   */
  private async sendToFCM(tokens: string[], payload: INotificationPayload) {
    try {
      // ✅ Fixed: Chunk tokens into batches of 500 (Firebase multicast limit)
      const BATCH_SIZE = 500;
      const chunks: string[][] = [];
      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        chunks.push(tokens.slice(i, i + BATCH_SIZE));
      }

      for (const chunk of chunks) {
        const message = {
          tokens: chunk,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data || {},
        };

        const response = await firebaseAdmin
          .messaging()
          .sendEachForMulticast(message);

        // Cleanup Invalid Tokens
        if (response.failureCount > 0) {
          const failedTokens: string[] = [];
          response.responses.forEach((resp: any, idx: number) => {
            if (!resp.success) {
              const errCode = resp.error?.code;
              if (
                errCode === "messaging/registration-token-not-registered" ||
                errCode === "messaging/mismatched-credential"
              ) {
                failedTokens.push(chunk[idx]);
              }
            }
          });

          if (failedTokens.length > 0) {
            await DeviceToken.deleteMany({ fcmToken: { $in: failedTokens } });
            logger.info(
              colors.yellow(
                `🗑️ Cleaned up ${failedTokens.length} invalid tokens.`,
              ),
            );
          }
        }
      }
    } catch (error) {
      logger.error(colors.red("FCM Send Error:"), error);
    }
  }

  /**
   * 🔒 PRIVATE: Handle Database Saving
   */
  private async saveToDatabase(userIds: any[], payload: INotificationPayload) {
    try {
      const notifications = userIds.map((userId) => ({
        receiver: userId,
        title: payload.title,
        text: payload.body,
        type: payload.type,
        read: false,
        referenceId: payload.data?.referenceId || undefined,
        referenceModel: payload.data?.referenceModel || undefined,
      }));

      await Notification.insertMany(notifications);
    } catch (error) {
      logger.error(colors.red("DB Save Error:"), error);
    }
  }

  /**
   * 🔒 PRIVATE: Handle Email Sending
   */
  private async sendToEmail(users: any[], payload: INotificationPayload) {
    try {
      const emailTasks = users.map(async (user) => {
        if (!user.email) return;
        const emailPayload = emailTemplate.genericNotification({
          to: user.email,
          subject: payload.title,
          text: payload.body,
        });
        return emailHelper.sendEmail(emailPayload);
      });

      await Promise.allSettled(emailTasks);
    } catch (error) {
      logger.error(
        colors.red("Email Send Error inside NotificationHelper:"),
        error,
      );
    }
  }
}

export const notificationHelper = new NotificationHelper();
