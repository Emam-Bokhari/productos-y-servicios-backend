import { Subscription } from "./subscription.model";

const getMySubscriptionsFromDB = async (userId: string) => {
  return await Subscription.find({ userId })
    .populate("packageId")
    .populate("cityConfigId");
};

export const SubscriptionService = {
  getMySubscriptionsFromDB,
};
