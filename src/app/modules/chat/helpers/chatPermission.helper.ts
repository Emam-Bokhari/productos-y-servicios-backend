import { Types } from "mongoose";
import { User } from "../../user/user.model";
import { Support } from "../../support/support.model";
import { CHAT_COMMUNICATION_TYPE } from "../../../../enums/chat";
import { STATUS, USER_ROLES } from "../../../../enums/user";

export interface IChatPermissionResult {
  allowed: boolean;
  reason: string;
}

/**
 * Centrally validates if chat communication is allowed between sender and receiver.
 */
export const checkChatPermission = async (
  senderId: string | Types.ObjectId,
  receiverId: string | Types.ObjectId,
  communicationType: CHAT_COMMUNICATION_TYPE,
  referenceId?: string | Types.ObjectId,
): Promise<IChatPermissionResult> => {
  const sender = await User.findById(senderId);
  const receiver = await User.findById(receiverId);

  // 1. Verify user exists
  if (!sender) {
    return { allowed: false, reason: "Sender user account not found." };
  }
  if (!receiver) {
    return { allowed: false, reason: "Receiver user account not found." };
  }

  // 2. Verify blocked status (User status)
  if (sender.status === STATUS.INACTIVE) {
    return {
      allowed: false,
      reason: "Sender is currently suspended or inactive.",
    };
  }
  if (receiver.status === STATUS.INACTIVE) {
    return { allowed: false, reason: "Receiver user is blocked or suspended." };
  }

  // 3. Contextual/Reference Validations
  switch (communicationType) {
    case CHAT_COMMUNICATION_TYPE.SUPPORT: {
      const isAdmin =
        sender.role === USER_ROLES.ADMIN ||
        sender.role === USER_ROLES.SUPER_ADMIN ||
        receiver.role === USER_ROLES.ADMIN ||
        receiver.role === USER_ROLES.SUPER_ADMIN;

      if (!isAdmin) {
        return {
          allowed: false,
          reason: "Support chat requires at least one admin participant.",
        };
      }

      if (referenceId) {
        const ticket = await Support.findById(referenceId);
        if (!ticket) {
          return { allowed: false, reason: "Support ticket not found." };
        }
      }
      break;
    }

    case CHAT_COMMUNICATION_TYPE.PRODUCT:
    case CHAT_COMMUNICATION_TYPE.SERVICE:
    case CHAT_COMMUNICATION_TYPE.STORE:
    case CHAT_COMMUNICATION_TYPE.OTHER:
      // Regular messaging between active users, sellers, or admins
      break;

    default:
      return { allowed: false, reason: "Invalid communication type." };
  }

  return { allowed: true, reason: "Allowed" };
};

export const chatPermissionHelper = {
  checkChatPermission,
};
