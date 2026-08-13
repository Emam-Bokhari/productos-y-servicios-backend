import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { User } from "../user/user.model";
import stripeService from "./stripe.service";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import stripe from "../../../config/stripe";
import Stripe from "stripe";
import { SubscriptionPackage } from "../subscriptionPackage/subscriptionPackage.model";

// ----------------------------------------------------
// Stripe Connected Account for Sellers (Onboarding)
// ----------------------------------------------------
const createStripeAccount = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;

  const stripeAccount = await stripeService.createConnectedAccount(
    user.email,
    user.id,
  );

  // Update User's Stripe account ID
  await User.findByIdAndUpdate(user.id, {
    stripeConnectedAccountId: stripeAccount.id,
  });

  const returnUrl = `${config.stripe.BASE_URL || "http://10.10.7.41:5005"}/stripe/onboarding/success`;
  const refreshUrl = `${config.stripe.BASE_URL || "http://10.10.7.41:5005"}/stripe/onboarding/refresh`;

  const onboardingLink = await stripeService.createAccountLink(
    stripeAccount.id,
    returnUrl,
    refreshUrl,
  );

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Stripe account created successfully",
    data: { link: onboardingLink },
  });
});

const getStripeDashboardLink = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;

    const userProfile = await User.findById(user.id);
    const connectedAccountId = userProfile?.stripeConnectedAccountId;

    if (!connectedAccountId) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Stripe account not connected",
      );
    }

    const dashboardLink =
      await stripeService.createLoginLink(connectedAccountId);

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: "Stripe Dashboard link generated",
      data: { url: dashboardLink },
    });
  },
);

const getAccountDetails = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;

  const userProfile = await User.findById(user.id);
  const connectedAccountId = userProfile?.stripeConnectedAccountId;

  if (!connectedAccountId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Stripe account not connected");
  }

  const account = await stripeService.retrieveAccount(connectedAccountId);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Stripe account details retrieved",
    data: {
      accountId: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements: account.requirements,
    },
  });
});

// ----------------------------------------------------
// Payments & Refunds (Stubbed for template use)
// ----------------------------------------------------
const createCheckoutSession = catchAsync(
  async (req: Request, res: Response) => {
    throw new ApiError(
      StatusCodes.NOT_IMPLEMENTED,
      "Ride payments not supported in this template.",
    );
  },
);

const getPaymentStatus = catchAsync(async (req: Request, res: Response) => {
  throw new ApiError(
    StatusCodes.NOT_IMPLEMENTED,
    "Payment status check not supported in this template.",
  );
});

const refundTransaction = catchAsync(async (req: Request, res: Response) => {
  throw new ApiError(
    StatusCodes.NOT_IMPLEMENTED,
    "Refund not supported in this template.",
  );
});

// ----------------------------------------------------
// Stripe Webhook Event Handler (Stubbed for template use)
// ----------------------------------------------------
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

const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Missing stripe-signature header");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      config.stripe.webhookSecret,
    );
  } catch (err: any) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send(`Webhook Verification Failed: ${err.message}`);
  }

  console.log(`[Stripe Webhook] Event received: ${event.type}`);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        const userId = session.metadata?.userId;
        const packageId = session.metadata?.packageId;
        const subscriptionId = session.subscription as string;

        if (subscriptionId) {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
          const stripeCustomerId = subscription.customer as string;
          const status = subscription.status;
          const expiresAt = new Date(subscription.current_period_end * 1000);

          const priceId = subscription.items.data[0]?.price.id;
          let pkg = null;

          if (packageId) {
            pkg = await SubscriptionPackage.findById(packageId);
          } else if (priceId) {
            pkg = await SubscriptionPackage.findOne({ stripePriceId: priceId });
          }

          const updateData: Record<string, any> = {
            subscriptionStatus: mapStripeStatusToLocal(status),
            stripeSubscriptionId: subscriptionId,
            subscriptionExpiresAt: expiresAt,
          };

          if (pkg) {
            updateData.subscriptionPackageId = pkg._id;
          }
          if (stripeCustomerId) {
            updateData.stripeCustomerId = stripeCustomerId;
          }

          if (userId) {
            await User.findByIdAndUpdate(userId, updateData);
          } else {
            await User.findOneAndUpdate(
              {
                $or: [
                  { stripeCustomerId },
                  { email: session.customer_details?.email },
                ],
              },
              updateData,
            );
          }
        }
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;
      const stripeCustomerId = subscription.customer as string;
      const status = subscription.status;
      const expiresAt = new Date(subscription.current_period_end * 1000);

      const priceId = subscription.items.data[0]?.price.id;
      const pkg = await SubscriptionPackage.findOne({ stripePriceId: priceId });

      const updateData: Record<string, any> = {
        subscriptionStatus: mapStripeStatusToLocal(status),
        stripeSubscriptionId: subscriptionId,
        subscriptionExpiresAt: expiresAt,
      };

      if (pkg) {
        updateData.subscriptionPackageId = pkg._id;
      }

      await User.findOneAndUpdate(
        {
          $or: [{ stripeCustomerId }, { stripeSubscriptionId: subscriptionId }],
        },
        updateData,
      );
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;

      await User.findOneAndUpdate(
        { stripeSubscriptionId: subscriptionId },
        {
          subscriptionStatus: "canceled",
          subscriptionExpiresAt: new Date(),
        },
      );
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event: ${event.type}`);
  }

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Webhook event processed",
    data: {},
  });
});

export const StripeControllers = {
  createStripeAccount,
  getStripeDashboardLink,
  getAccountDetails,
  createCheckoutSession,
  getPaymentStatus,
  refundTransaction,
  handleWebhook,
};
