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
import { Subscription } from "../subscription/subscription.model";
import { CityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.model";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { Transaction } from "../transaction/transaction.model";
import { TransactionService } from "../transaction/transaction.service";

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
    const userId = req.user.id;
    const { packageId, cityConfigId } = req.body;

    if (!packageId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Package ID is required");
    }

    const pkg = await SubscriptionPackage.findById(packageId);
    if (!pkg) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
    }

    const targetCityConfigId = cityConfigId;
    if (pkg.packageType === "post_add" && !targetCityConfigId) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "City configuration ID is required for purchasing a post_add package",
      );
    }

    if (targetCityConfigId) {
      const activeCity = await CityAdConfiguration.findOne({
        _id: targetCityConfigId,
        status: "active",
      });
      if (!activeCity) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          "The selected city configuration is not active or does not exist",
        );
      }
    }

    const userProfile = await User.findById(userId);
    if (!userProfile) {
      throw new ApiError(StatusCodes.NOT_FOUND, "User profile not found");
    }

    const customerId = await stripeService.getOrCreateCustomer(
      userId,
      userProfile.email,
      userProfile.name,
    );

    const mode = pkg.packageType === "store_creation" ? "subscription" : "payment";
    const line_items = [
      {
        price: pkg.stripePriceId,
        quantity: 1,
      },
    ];

    const metadata = {
      userId,
      packageId: pkg._id.toString(),
      packageType: pkg.packageType,
      cityConfigId: targetCityConfigId || "",
    };

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      payment_method_types: ["card"],
      line_items,
      mode,
      metadata,
      success_url: `${config.stripe.BASE_URL || "http://localhost:3000"}/stripe/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.stripe.BASE_URL || "http://localhost:3000"}/stripe/payment/cancel`,
    };

    if (mode === "subscription") {
      sessionParams.subscription_data = {
        metadata,
      };
    } else {
      sessionParams.payment_intent_data = {
        metadata,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: "Checkout session created successfully",
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  },
);

const getPaymentStatus = catchAsync(async (req: Request, res: Response) => {
  throw new ApiError(
    StatusCodes.NOT_IMPLEMENTED,
    "Payment status check not supported in this template.",
  );
});

const refundTransaction = catchAsync(async (req: Request, res: Response) => {
  const transactionId = req.body.id || req.body.transactionId;
  if (!transactionId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Transaction ID is required in request body.");
  }
  const result = await TransactionService.refundTransactionFromDB(transactionId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transaction refunded successfully",
    data: result,
  });
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

const calculateExpirationDate = (duration: string, startDate = new Date()): Date => {
  const d = new Date(startDate);
  switch (duration) {
    case "seven_days":
      d.setDate(d.getDate() + 7);
      break;
    case "one_month":
      d.setMonth(d.getMonth() + 1);
      break;
    case "three_month":
      d.setMonth(d.getMonth() + 3);
      break;
    case "six_month":
      d.setMonth(d.getMonth() + 6);
      break;
    case "one_year":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d;
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
      const userId = session.metadata?.userId;
      const packageId = session.metadata?.packageId;
      const packageType = session.metadata?.packageType;
      const cityConfigId = session.metadata?.cityConfigId;

      if (session.mode === "subscription") {
        const subscriptionId = session.subscription as string;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ["latest_invoice"],
          });
          const stripeCustomerId = subscription.customer as string;
          const status = subscription.status;
          const periodEnd = subscription.current_period_end || subscription.trial_end;
          const expiresAt = periodEnd ? new Date(periodEnd * 1000) : new Date();

          const latestInvoice = subscription.latest_invoice as Stripe.Invoice;
          const trxId = typeof latestInvoice === "object" && latestInvoice !== null
            ? (latestInvoice.payment_intent as string || "")
            : "";

          const localSub = await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subscriptionId },
            {
              userId,
              packageId,
              packageType: "store_creation",
              status: mapStripeStatusToLocal(status),
              expiresAt,
              stripeSubscriptionId: subscriptionId,
              stripeSessionId: session.id,
              amountPaid: session.amount_total ? session.amount_total / 100 : 0,
              trxId,
            },
            { upsert: true, new: true }
          );

          await User.findByIdAndUpdate(userId, {
            subscriptionStatus: mapStripeStatusToLocal(status),
            subscriptionPackageId: packageId,
            subscriptionExpiresAt: expiresAt,
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId,
          });

          // Create Transaction record if it does not exist already
          if (trxId) {
            const existingTx = await Transaction.findOne({
              $or: [
                { stripePaymentIntentId: trxId },
                { gatewayTransactionId: trxId }
              ]
            });
            if (!existingTx) {
              const count = await Transaction.countDocuments({
                transactionId: { $regex: "^INV-" }
              });
              const invoiceNumber = 1000 + count;
              const generatedTxId = `INV-${new Date().getFullYear()}-${invoiceNumber}`;

              await Transaction.create({
                transactionId: generatedTxId,
                userId,
                packageId,
                amount: session.amount_total ? session.amount_total / 100 : 0,
                paymentMethod: "ONLINE",
                paymentStatus: "PAID",
                transactionType: "booking_payment",
                stripeCustomerId,
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId: trxId,
                gatewayTransactionId: trxId,
              });
            }
          }

          if (localSub) {
            const pkg = await SubscriptionPackage.findById(packageId);
            await sendNotifications({
              receiver: userId,
              title: "Subscription Activated",
              text: `Your subscription to "${pkg ? pkg.name : "Subscription Plan"}" has been successfully activated.`,
              type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
              referenceId: localSub._id,
              referenceModel: "Subscription",
            });
          }
        }
      } else if (session.mode === "payment" && packageType === "post_add") {
        const pkg = await SubscriptionPackage.findById(packageId);
        if (pkg) {
          const expiresAt = calculateExpirationDate(pkg.duration);
          const createdSub = await Subscription.create({
            userId,
            packageId,
            packageType: "post_add",
            status: "active",
            expiresAt,
            cityConfigId: cityConfigId || undefined,
            stripeSessionId: session.id,
            amountPaid: session.amount_total ? session.amount_total / 100 : 0,
            trxId: session.payment_intent as string || "",
          });

          const trxId = session.payment_intent as string || "";
          if (trxId) {
            const existingTx = await Transaction.findOne({
              $or: [
                { stripePaymentIntentId: trxId },
                { gatewayTransactionId: trxId }
              ]
            });
            if (!existingTx) {
              const count = await Transaction.countDocuments({
                transactionId: { $regex: "^INV-" }
              });
              const invoiceNumber = 1000 + count;
              const generatedTxId = `INV-${new Date().getFullYear()}-${invoiceNumber}`;

              await Transaction.create({
                transactionId: generatedTxId,
                userId,
                packageId,
                amount: session.amount_total ? session.amount_total / 100 : 0,
                paymentMethod: "ONLINE",
                paymentStatus: "PAID",
                transactionType: "booking_payment",
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId: trxId,
                gatewayTransactionId: trxId,
              });
            }
          }

          if (createdSub) {
            await sendNotifications({
              receiver: userId,
              title: "Subscription Activated",
              text: `Your post advertisement subscription pack "${pkg.name}" has been successfully activated.`,
              type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
              referenceId: createdSub._id,
              referenceModel: "Subscription",
            });
          }
        }
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const eventSubscription = event.data.object as Stripe.Subscription;
      const subscriptionId = eventSubscription.id;

      // Retrieve live subscription from Stripe to ensure current_period_end and trial_end are fully populated
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice"],
      });
      const stripeCustomerId = subscription.customer as string;
      const status = subscription.status;
      const periodEnd = subscription.current_period_end || subscription.trial_end;
      const expiresAt = periodEnd ? new Date(periodEnd * 1000) : new Date();

      const priceId = subscription.items.data[0]?.price.id;
      const pkg = await SubscriptionPackage.findOne({ stripePriceId: priceId });

      const latestInvoice = subscription.latest_invoice as Stripe.Invoice;
      const trxId = typeof latestInvoice === "object" && latestInvoice !== null
        ? (latestInvoice.payment_intent as string || "")
        : "";
      const amountPaid = typeof latestInvoice === "object" && latestInvoice !== null
        ? (latestInvoice.amount_paid ? latestInvoice.amount_paid / 100 : 0)
        : 0;

      const localSub = await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: subscriptionId },
        {
          status: mapStripeStatusToLocal(status),
          expiresAt,
          trxId,
          amountPaid,
        },
        { new: true }
      );

      // Create Transaction record if it does not exist already
      if (trxId) {
        const existingTx = await Transaction.findOne({
          $or: [
            { stripePaymentIntentId: trxId },
            { gatewayTransactionId: trxId }
          ]
        });
        if (!existingTx) {
          let resolvedUserId = localSub?.userId;
          let resolvedPackageId = localSub?.packageId || pkg?._id;

          if (!resolvedUserId && stripeCustomerId) {
            const user = await User.findOne({ stripeCustomerId });
            if (user) resolvedUserId = user._id;
          }

          if (resolvedUserId && resolvedPackageId) {
            const count = await Transaction.countDocuments({
              transactionId: { $regex: "^INV-" }
            });
            const invoiceNumber = 1000 + count;
            const generatedTxId = `INV-${new Date().getFullYear()}-${invoiceNumber}`;

            await Transaction.create({
              transactionId: generatedTxId,
              userId: resolvedUserId,
              packageId: resolvedPackageId,
              amount: amountPaid,
              paymentMethod: "ONLINE",
              paymentStatus: "PAID",
              transactionType: "booking_payment",
              stripeCustomerId,
              stripePaymentIntentId: trxId,
              gatewayTransactionId: trxId,
            });
          }
        }
      }

      if (localSub) {
        await User.findByIdAndUpdate(localSub.userId, {
          subscriptionStatus: mapStripeStatusToLocal(status),
          subscriptionExpiresAt: expiresAt,
        });
      } else {
        const user = await User.findOneAndUpdate(
          { stripeCustomerId },
          {
            subscriptionStatus: mapStripeStatusToLocal(status),
            subscriptionExpiresAt: expiresAt,
          },
          { new: true }
        );
        if (user && pkg) {
          await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subscriptionId },
            {
              userId: user._id,
              packageId: pkg._id,
              packageType: "store_creation",
              status: mapStripeStatusToLocal(status),
              expiresAt,
              stripeSubscriptionId: subscriptionId,
              trxId,
              amountPaid,
            },
            { upsert: true }
          );
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;

      const localSub = await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: subscriptionId },
        {
          status: "canceled",
          expiresAt: new Date(),
        },
        { new: true }
      );

      if (localSub) {
        await User.findByIdAndUpdate(localSub.userId, {
          subscriptionStatus: "canceled",
          subscriptionExpiresAt: new Date(),
        });

        await sendNotifications({
          receiver: localSub.userId.toString(),
          title: "Subscription Cancelled",
          text: "Your subscription has been cancelled.",
          type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
          referenceId: localSub._id,
          referenceModel: "Subscription",
        });
      } else {
        const user = await User.findOneAndUpdate(
          { stripeSubscriptionId: subscriptionId },
          {
            subscriptionStatus: "canceled",
            subscriptionExpiresAt: new Date(),
          },
          { new: true }
        );

        const findSub = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
        if (user && findSub) {
          await sendNotifications({
            receiver: user._id.toString(),
            title: "Subscription Cancelled",
            text: "Your subscription has been cancelled.",
            type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
            referenceId: findSub._id,
            referenceModel: "Subscription",
          });
        }
      }
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
