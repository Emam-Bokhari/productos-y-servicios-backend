import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import ApiError from "../errors/ApiErrors";
import stripe from "../config/stripe";
const User: any = "";
const Subscription: any = "";

export const handleSubscriptionDeleted = async (data: Stripe.Subscription) => {
  // Retrieve the subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(data.id);

  // Find the current active subscription
  const userSubscription = await Subscription.findOne({
    customerId: subscription.customer,
    status: "active",
  });

  if (userSubscription) {
    // Deactivate the subscription
    await Subscription.findByIdAndUpdate(
      userSubscription._id,
      { status: "deactivated" },
      { new: true },
    );

    // Find the user associated with the subscription
    const existingUser = await User.findById(userSubscription?.userId);

    if (existingUser) {
      await User.findByIdAndUpdate(
        existingUser._id,
        { hasAccess: false },
        { new: true },
      );
    } else {
      throw new ApiError(StatusCodes.NOT_FOUND, `User not found.`);
    }
  } else {
    throw new ApiError(StatusCodes.NOT_FOUND, `Subscription not found.`);
  }
};
