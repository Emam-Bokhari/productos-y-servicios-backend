import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { User } from "../user/user.model";
import stripeService from "./stripe.service";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";

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
const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Missing stripe-signature header");
  }

  // A basic webhook listener that can be updated for orders/products later
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Webhook event received and logged",
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
