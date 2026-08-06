import { Types } from "mongoose";
import { User } from "../../user/user.model";
import { Support } from "../../support/support.model";
import { CHAT_COMMUNICATION_TYPE } from "../../../../enums/chat";
import { STATUS } from "../../../../enums/user";

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
    case CHAT_COMMUNICATION_TYPE.REGULAR_RIDE:
    case CHAT_COMMUNICATION_TYPE.SCHEDULED_RIDE:
    case CHAT_COMMUNICATION_TYPE.RESERVATION:
    case CHAT_COMMUNICATION_TYPE.LOST_FOUND: {
      return {
        allowed: false,
        reason:
          "Ride and Lost & Found services are disabled in this project template.",
      };
    }

    case CHAT_COMMUNICATION_TYPE.SUPPORT: {
      if (!referenceId) {
        return {
          allowed: false,
          reason: "Support ticket reference ID is required.",
        };
      }
      const ticket = await Support.findById(referenceId);
      if (!ticket) {
        return { allowed: false, reason: "Support ticket not found." };
      }

      // One participant must be the owner of the ticket, the other must be admin/super_admin
      const isOwner =
        ticket.userId &&
        (ticket.userId.toString() === sender._id.toString() ||
          ticket.userId.toString() === receiver._id.toString());
      const isAdmin =
        sender.role === "admin" ||
        sender.role === "super_admin" ||
        receiver.role === "admin" ||
        receiver.role === "super_admin";

      if (!isOwner || !isAdmin) {
        return {
          allowed: false,
          reason: "Support chat requires the ticket owner and a support agent.",
        };
      }
      break;
    }

    case CHAT_COMMUNICATION_TYPE.OTHER:
      // Other communication context, we require no special checks besides active user validation
      break;

    default:
      return { allowed: false, reason: "Invalid communication type." };
  }

  return { allowed: true, reason: "Allowed" };
};

export const chatPermissionHelper = {
  checkChatPermission,
};
