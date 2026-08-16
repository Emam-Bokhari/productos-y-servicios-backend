import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import ApiError from "../errors/ApiErrors";
import stripe from "../config/stripe";
import { User } from "../app/modules/user/user.model";
import { SubscriptionPackage } from "../app/modules/subscriptionPackage/subscriptionPackage.model";
import { Subscription } from "../app/modules/subscription/subscription.model";

export const handleSubscriptionCreated = async (data: Stripe.Subscription) => {
  // Retrieve the subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(data.id);

  // Retrieve the customer associated with the subscription
  const customer = (await stripe.customers.retrieve(
    subscription.customer as string,
  )) as Stripe.Customer;

  // Extract the price ID from the subscription items
  const priceId = subscription.items.data[0]?.price?.id;

  // Retrieve the invoice to get the transaction ID and amount paid
  const invoice = await stripe.invoices.retrieve(
    subscription.latest_invoice as string,
  );

  const trxId = invoice?.payment_intent;
  const amountPaid = invoice?.total ? invoice.total / 100 : 0;

  if (customer?.email) {
    const existingUser = await User.findOne({ email: customer?.email });

    if (existingUser) {
      // Find the pricing plan by stripePriceId
      const pricingPlan = await SubscriptionPackage.findOne({
        stripePriceId: priceId,
      });

      if (pricingPlan) {
        // Find the current active subscription
        const currentActiveSubscription = await Subscription.findOne({
          userId: existingUser._id,
          status: "active",
        });

        if (currentActiveSubscription) {
          throw new ApiError(
            StatusCodes.CONFLICT,
            "User already has an active subscription.",
          );
        }

        const expiresAt = new Date(subscription.current_period_end * 1000);

        // Create a new subscription record
        const newSubscription = new Subscription({
          userId: existingUser._id,
          packageId: pricingPlan._id,
          packageType: "store_creation",
          status: subscription.status === "trialing" ? "trialing" : "active",
          expiresAt,
          stripeSubscriptionId: subscription.id,
          amountPaid,
          trxId: (trxId as string) || "",
        });

        await newSubscription.save();

        // Update the user to reflect the active subscription
        await User.findByIdAndUpdate(
          existingUser._id,
          {
            subscriptionStatus:
              subscription.status === "trialing" ? "trialing" : "active",
            subscriptionPackageId: pricingPlan._id,
            subscriptionExpiresAt: expiresAt,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customer.id,
          },
          { new: true },
        );
      } else {
        throw new ApiError(
          StatusCodes.NOT_FOUND,
          `Pricing plan with Price ID: ${priceId} not found!`,
        );
      }
    } else {
      throw new ApiError(StatusCodes.NOT_FOUND, `Invalid User!`);
    }
  } else {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "No email found for the customer!",
    );
  }
};
