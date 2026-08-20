import { JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";
import { User } from "../user/user.model";
import { Store } from "../store/store.model";
import { USER_ROLES, STATUS } from "../../../enums/user";
import { STORE_TYPE, STORE_STATUS } from "../store/store.constant";
import { Broadcast } from "./broadcast.model";
import { IBroadcast } from "./broadcast.interface";
import {
  BROADCAST_AUDIENCE,
  BROADCAST_CHANNEL,
  BROADCAST_STATUS,
} from "./broadcast.constant";
import { notificationHelper } from "../../builder/pushNotification";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import QueryBuilder from "../../builder/queryBuilder";

const createBroadcast = async (
  user: JwtPayload,
  payload: Partial<IBroadcast>,
) => {
  // 1. Create Broadcast document as PENDING
  const broadcastData = {
    ...payload,
    status: BROADCAST_STATUS.PENDING,
    createdBy: new Types.ObjectId(user.id),
  };

  const broadcast = await Broadcast.create(broadcastData);

  // 2. Identify the target audience user ids
  let targetUserIds: Types.ObjectId[] = [];

  switch (payload.audience) {
    case BROADCAST_AUDIENCE.EVERYONE: {
      const users = await User.find({
        role: { $in: [USER_ROLES.USER, USER_ROLES.SELLER] },
        status: STATUS.ACTIVE,
      })
        .select("_id")
        .lean();
      targetUserIds = users.map((u) => u._id);
      break;
    }

    case BROADCAST_AUDIENCE.BUYERS: {
      const users = await User.find({
        role: USER_ROLES.USER,
        status: STATUS.ACTIVE,
      })
        .select("_id")
        .lean();
      targetUserIds = users.map((u) => u._id);
      break;
    }

    case BROADCAST_AUDIENCE.ALL_SELLERS: {
      const users = await User.find({
        role: USER_ROLES.SELLER,
        status: STATUS.ACTIVE,
      })
        .select("_id")
        .lean();
      targetUserIds = users.map((u) => u._id);
      break;
    }

    case BROADCAST_AUDIENCE.PRODUCT_SELLERS: {
      const stores = await Store.find({
        storeType: STORE_TYPE.PRODUCT_STORE,
        status: STORE_STATUS.ACTIVE,
      })
        .select("owner")
        .lean();
      const owners = stores.map((s) => s.owner).filter(Boolean);
      const users = await User.find({
        _id: { $in: owners },
        role: USER_ROLES.SELLER,
        status: STATUS.ACTIVE,
      })
        .select("_id")
        .lean();
      targetUserIds = users.map((u) => u._id);
      break;
    }

    case BROADCAST_AUDIENCE.SERVICE_SELLERS: {
      const stores = await Store.find({
        storeType: STORE_TYPE.SERVICE_STORE,
        status: STORE_STATUS.ACTIVE,
      })
        .select("owner")
        .lean();
      const owners = stores.map((s) => s.owner).filter(Boolean);
      const users = await User.find({
        _id: { $in: owners },
        role: USER_ROLES.SELLER,
        status: STATUS.ACTIVE,
      })
        .select("_id")
        .lean();
      targetUserIds = users.map((u) => u._id);
      break;
    }
  }

  // 3. Send Push Notifications if user ids exist
  if (targetUserIds.length > 0) {
    // Strip HTML tags for push notification body text
    const plainBody = payload.message?.replace(/<[^>]*>/g, "") || "";

    await notificationHelper.sendToBatch(targetUserIds, {
      title: payload.title || "Announcement",
      body: plainBody,
      type: NOTIFICATION_TYPE.BROADCAST,
      data: {
        type: NOTIFICATION_TYPE.BROADCAST,
        referenceId: broadcast._id.toString(),
        referenceModel: "Broadcast",
      },
    });
  }

  // 4. Update Broadcast document status to SENT
  const updatedBroadcast = await Broadcast.findByIdAndUpdate(
    broadcast._id,
    {
      $set: {
        status: BROADCAST_STATUS.SENT,
        sentAt: new Date(),
      },
    },
    { new: true },
  ).populate("createdBy");

  return updatedBroadcast;
};

const getBroadcastsFromDB = async (query: Record<string, unknown>) => {
  const baseQuery = Broadcast.find().populate("createdBy");
  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(["title", "message"])
    .filter()
    .sort()
    .paginate();
  const data = await queryBuilder.modelQuery;
  const meta = await queryBuilder.countTotal();
  return { data, meta };
};

const deleteBroadcastFromDB = async (id: string) => {
  const result = await Broadcast.softDeleteById(id);
  return result;
};

export const BroadcastServices = {
  createBroadcast,
  getBroadcastsFromDB,
  deleteBroadcastFromDB,
};
