import colors from "colors";
import { Server, Socket } from "socket.io";
import { logger } from "../shared/logger";
import { jwtHelper } from "./jwtHelper";
import config from "../config";
import { User } from "../app/modules/user/user.model";
import { Secret } from "jsonwebtoken";

// Map to store connected userId -> Socket object
const socketMap = new Map<string, Socket>();

const socket = (io: Server) => {
  io.on("connection", async (socket: Socket) => {
    logger.info(colors.blue("A User connected to Socket.IO"));

    // Attempt authentication via token in query or auth object
    const token =
      (socket.handshake.query?.token as string) ||
      (socket.handshake.auth?.token as string);

    if (token) {
      try {
        const decoded = jwtHelper.verifyToken(
          token,
          config.jwt.jwt_secret as Secret,
        );
        if (decoded && decoded.id) {
          const userId = decoded.id.toString();

          // Verify if the user exists in the database
          const userExists = await User.findById(userId);
          if (!userExists) {
            logger.error(
              colors.red(
                `Socket authentication failed: User ${userId} does not exist in the database.`,
              ),
            );
            socket.disconnect();
            return;
          }

          socketMap.set(userId, socket);
          socket.data = { userId, role: decoded.role };
          logger.info(
            colors.green(
              `Socket successfully authenticated for User: ${userId} (${decoded.role})`,
            ),
          );
        }
      } catch (err: any) {
        logger.error(
          colors.yellow(
            `Socket connection token verification failed: ${err.message}`,
          ),
        );
      }
    }

    // Explicit registration event fallback
    socket.on("register", (data: { userId: string }) => {
      if (data?.userId) {
        const userId = data.userId.toString();
        socketMap.set(userId, socket);
        socket.data = { ...socket.data, userId };
        logger.info(
          colors.green(`Socket manually registered User ID: ${userId}`),
        );
      }
    });



    // disconnect
    socket.on("disconnect", (reason) => {
      const userId = socket.data?.userId;
      if (userId) {
        socketMap.delete(userId);
        logger.info(
          colors.red(`User ${userId} disconnected. Reason: ${reason}`),
        );
      } else {
        logger.info(colors.red(`A user disconnect. Reason: ${reason}`));
      }
    });
  });
};

/**
 * Emit socket event to a specific user
 */
const sendToUser = (
  userId: string | any,
  event: string,
  data: any,
): boolean => {
  if (!userId) return false;
  const key = userId.toString();
  const clientSocket = socketMap.get(key);
  if (clientSocket) {
    clientSocket.emit(event, data);
    logger.info(colors.green(`Socket event '${event}' sent to user: ${key}`));
    return true;
  }
  logger.warn(
    colors.yellow(`Socket event '${event}' FAILED - user ${key} not connected`),
  );
  return false;
};

/**
 * Emit socket event to multiple users
 */
const sendToUsers = (
  userIds: (string | any)[],
  event: string,
  data: any,
): void => {
  for (const id of userIds) {
    sendToUser(id, event, data);
  }
};

export const socketHelper = {
  socket,
  sendToUser,
  sendToUsers,
};
