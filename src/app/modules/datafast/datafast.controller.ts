import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { User } from "../user/user.model";
import { SubscriptionPackage } from "../subscriptionPackage/subscriptionPackage.model";
import { Subscription } from "../subscription/subscription.model";
import { CityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.model";
import { Transaction } from "../transaction/transaction.model";
import { TransactionService } from "../transaction/transaction.service";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import datafastService from "./datafast.service";
import { invoiceService } from "../invoice/invoice.service";

export const calculateExpirationDate = (
  duration: string,
  startDate = new Date(),
): Date => {
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

/**
 * Create checkout session via Datafast
 */
const createCheckoutSession = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { packageId, cityConfigId, position } = req.body;

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

  let activeCity = null;
  if (targetCityConfigId) {
    activeCity = await CityAdConfiguration.findOne({
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

  let chargedAmount = pkg.price;
  let selectedPosition: number | undefined;

  if (position !== undefined && position !== null) {
    selectedPosition = Number(position);
    if (!activeCity) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "City configuration ID is required when specifying a position",
      );
    }
    if (
      isNaN(selectedPosition) ||
      selectedPosition < 1 ||
      selectedPosition > activeCity.featuredCapacity
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Invalid position: ${position}. Position must be between 1 and ${activeCity.featuredCapacity}.`,
      );
    }

    const pricingObj = (activeCity.featuredPositionPricing || []).find(
      (p) => p.position === selectedPosition,
    );
    if (pricingObj && pricingObj.price > 0) {
      chargedAmount = pricingObj.price;
    }
  }

  const userProfile = await User.findById(userId);
  if (!userProfile) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User profile not found");
  }

  const isSubscription = pkg.packageType === "store_creation";

  // Generate unique merchant transaction ID
  const count = await Transaction.countDocuments({
    transactionId: { $regex: "^INV-" },
  });
  const invoiceNumber = 1000 + count + 1;
  const merchantTxId = `INV-${new Date().getFullYear()}-${invoiceNumber}`;

  const checkoutResult = await datafastService.prepareCheckoutSession({
    amount: chargedAmount,
    currency: "USD",
    userEmail: userProfile.email,
    userName: userProfile.name,
    isSubscription,
    merchantTransactionId: merchantTxId,
    metadata: {
      userId,
      packageId: pkg._id.toString(),
      packageType: pkg.packageType,
      cityConfigId: targetCityConfigId || "",
      position: selectedPosition ? selectedPosition.toString() : "",
    },
  });

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Datafast checkout session created successfully",
    data: {
      sessionId: checkoutResult.checkoutId,
      checkoutId: checkoutResult.checkoutId,
      url: checkoutResult.redirectUrl,
      raw: checkoutResult.raw,
    },
  });
});

/**
 * Verify payment status & complete subscription activation
 */
const verifyPayment = catchAsync(async (req: Request, res: Response) => {
  const checkoutId =
    req.params.id || req.body.checkoutId || (req.query.checkoutId as string);

  const { packageId, cityConfigId, position } = req.body;
  const userId = req.user?.id || req.body.userId;

  if (!checkoutId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Checkout ID is required");
  }

  const paymentData = await datafastService.getPaymentStatus(checkoutId);
  const isSuccess = datafastService.isSuccessCode(paymentData.result?.code);

  if (!isSuccess) {
    throw new ApiError(
      StatusCodes.PAYMENT_REQUIRED,
      paymentData.result?.description || "Payment was not successful or was declined",
    );
  }

  const resolvedPackageId =
    packageId || paymentData.customParameters?.SHOPPER_PKG_ID;
  const resolvedUserId =
    userId || paymentData.customParameters?.SHOPPER_USER_ID;

  if (!resolvedPackageId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Subscription Package ID could not be resolved",
    );
  }

  const pkg = await SubscriptionPackage.findById(resolvedPackageId);
  if (!pkg) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Subscription package not found");
  }

  const amountPaid = Number(paymentData.amount) || pkg.price;
  const trxId = paymentData.id;
  const registrationToken = paymentData.registrationId || "";

  // Check if this payment/transaction was already processed
  let existingTx = await Transaction.findOne({
    $or: [{ gatewayTransactionId: trxId }, { stripePaymentIntentId: trxId }],
  });

  if (existingTx && existingTx.paymentStatus === "PAID") {
    const safeInvoice = existingTx.transactionId
      ? existingTx.transactionId.replace(/[^a-zA-Z0-9_-]/g, "_")
      : existingTx._id.toString();
    const invoiceUrl =
      existingTx.invoiceUrl || `/uploads/invoices/${safeInvoice}.pdf`;
    const invoiceDownloadUrl = `/api/v1/invoices/download/${safeInvoice}`;

    return sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: "Payment already verified",
      data: {
        transaction: existingTx,
        invoiceNumber: existingTx.transactionId,
        invoiceUrl,
        invoiceDownloadUrl,
      },
    });
  }

  const expiresAt = calculateExpirationDate(pkg.duration);

  let subscriptionRecord: any = null;

  if (pkg.packageType === "store_creation") {
    subscriptionRecord = await Subscription.findOneAndUpdate(
      { userId: resolvedUserId, packageType: "store_creation" },
      {
        userId: resolvedUserId,
        packageId: pkg._id,
        packageType: "store_creation",
        status: "active",
        expiresAt,
        stripeSubscriptionId: registrationToken, // backward compatibility
        datafastRegistrationToken: registrationToken,
        stripeSessionId: checkoutId,
        amountPaid,
        trxId,
      },
      { upsert: true, new: true },
    );

    await User.findByIdAndUpdate(resolvedUserId, {
      subscriptionStatus: "active",
      subscriptionPackageId: pkg._id,
      subscriptionExpiresAt: expiresAt,
      stripeSubscriptionId: registrationToken,
      datafastRegistrationToken: registrationToken,
    });
  } else {
    // post_add package
    const resolvedPosition = position
      ? Number(position)
      : paymentData.customParameters?.SHOPPER_POSITION
        ? Number(paymentData.customParameters.SHOPPER_POSITION)
        : undefined;

    subscriptionRecord = await Subscription.create({
      userId: resolvedUserId,
      packageId: pkg._id,
      packageType: "post_add",
      status: "active",
      expiresAt,
      cityConfigId: cityConfigId || undefined,
      position: resolvedPosition,
      stripeSessionId: checkoutId,
      amountPaid,
      trxId,
    });
  }

  // Create Transaction
  const count = await Transaction.countDocuments({
    transactionId: { $regex: "^INV-" },
  });
  const invoiceNumber = 1000 + count + 1;
  const generatedTxId = `INV-${new Date().getFullYear()}-${invoiceNumber}`;

  const safeInvoice = generatedTxId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const invoiceUrl = `/uploads/invoices/${safeInvoice}.pdf`;
  const invoiceDownloadUrl = `/api/v1/invoices/download/${safeInvoice}`;

  const newTransaction = await Transaction.create({
    transactionId: generatedTxId,
    userId: resolvedUserId,
    packageId: pkg._id,
    amount: amountPaid,
    paymentMethod: "ONLINE",
    paymentStatus: "PAID",
    transactionType: "booking_payment",
    stripeCustomerId: registrationToken,
    stripeCheckoutSessionId: checkoutId,
    stripePaymentIntentId: trxId,
    gatewayTransactionId: trxId,
    gatewayResponse: paymentData,
    invoiceUrl,
  });

  if (subscriptionRecord) {
    subscriptionRecord.invoiceNumber = generatedTxId;
    subscriptionRecord.invoiceUrl = invoiceUrl;
    await subscriptionRecord.save();
  }

  // Pre-generate PDF in background
  invoiceService.autoGenerateInvoiceForTransaction(generatedTxId);

  // Notification
  if (resolvedUserId) {
    await sendNotifications({
      receiver: resolvedUserId,
      title: "Subscription Activated",
      text: `Your subscription to "${pkg.name}" has been successfully activated via Datafast.`,
      type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
      referenceId: subscriptionRecord._id,
      referenceModel: "Subscription",
    });
  }

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Payment verified and subscription activated successfully",
    data: {
      subscription: subscriptionRecord,
      transaction: newTransaction,
      invoiceNumber: generatedTxId,
      invoiceUrl,
      invoiceDownloadUrl,
      paymentDetails: paymentData,
    },
  });
});

/**
 * Get payment status query
 */
const getPaymentStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Payment ID is required");
  }

  const paymentData = await datafastService.getPaymentStatus(id);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Payment status retrieved successfully",
    data: paymentData,
  });
});

/**
 * Refund Transaction (Admin only)
 */
const refundTransaction = catchAsync(async (req: Request, res: Response) => {
  const transactionId = req.body.id || req.body.transactionId;
  if (!transactionId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Transaction ID is required in request body",
    );
  }

  const result =
    await TransactionService.refundTransactionFromDB(transactionId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transaction refunded successfully",
    data: result,
  });
});

export const DatafastControllers = {
  createCheckoutSession,
  verifyPayment,
  getPaymentStatus,
  refundTransaction,
};
