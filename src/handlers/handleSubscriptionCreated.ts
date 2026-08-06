import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import ApiError from "../errors/ApiErrors";
import stripe from "../config/stripe";
const User: any = "";
const PricingPlan: any = "";
const Subscription: any = "";

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
  const amountPaid = invoice?.total / 100;

  if (customer?.email) {
    const existingUser = await User.findOne({ email: customer?.email });

    if (existingUser) {
      // Find the pricing plan by priceId
      const pricingPlan = await PricingPlan.findOne({ priceId });

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

        // Create a new subscription record
        const newSubscription = new Subscription({
          userId: existingUser._id,
          customerId: customer?.id,
          packageId: pricingPlan._id,
          status: "active",
          amountPaid,
          trxId,
        });

        await newSubscription.save();

        // Update the user to reflect the active subscription
        await User.findByIdAndUpdate(
          existingUser._id,
          {
            isSubscribed: true,
            hasAccess: true,
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
