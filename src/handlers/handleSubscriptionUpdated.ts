import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import ApiError from "../errors/ApiErrors";
import stripe from "../config/stripe";
import { User } from "../app/modules/user/user.model";
import { SubscriptionPackage } from "../app/modules/subscriptionPackage/subscriptionPackage.model";
import { Subscription } from "../app/modules/subscription/subscription.model";

const mapStripeStatusToLocal = (status: string) => {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "inactive";
  }
};

export const handleSubscriptionUpdated = async (data: Stripe.Subscription) => {
  // Retrieve the subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(data.id);

  // Retrieve the customer associated with the subscription
  const customer = (await stripe.customers.retrieve(
    subscription.customer as string,
  )) as Stripe.Customer;

  // Extract price ID from subscription items
  const priceId = subscription.items.data[0]?.price?.id;

  // Retrieve the invoice to get the transaction ID and amount paid
  const invoice = await stripe.invoices.retrieve(
    subscription.latest_invoice as string,
  );

  const trxId = invoice?.payment_intent;
  const amountPaid = invoice?.total ? invoice.total / 100 : 0;

  if (customer?.email) {
    // Find the user by email
    const existingUser = await User.findOne({ email: customer?.email });

    if (existingUser) {
      // Find the pricing plan by stripePriceId
      const pricingPlan = await SubscriptionPackage.findOne({
        stripePriceId: priceId,
      });

      if (pricingPlan) {
        const expiresAt = new Date(subscription.current_period_end * 1000);
        const status = mapStripeStatusToLocal(subscription.status);

        // Find and update or create subscription
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          {
            userId: existingUser._id,
            packageId: pricingPlan._id,
            packageType: "store_creation",
            status,
            expiresAt,
            stripeSubscriptionId: subscription.id,
            amountPaid,
            trxId: (trxId as string) || "",
          },
          { upsert: true },
        );

        // Update the user status
        await User.findByIdAndUpdate(existingUser._id, {
          subscriptionStatus: status,
          subscriptionPackageId: pricingPlan._id,
          subscriptionExpiresAt: expiresAt,
          stripeSubscriptionId: subscription.id,
        });
      } else {
        throw new ApiError(
          StatusCodes.NOT_FOUND,
          `Pricing plan with Price ID: ${priceId} not found!`,
        );
      }
    } else {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        `User with Email: ${customer.email} not found!`,
      );
    }
  } else {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "No email found for the customer!",
    );
  }
};
