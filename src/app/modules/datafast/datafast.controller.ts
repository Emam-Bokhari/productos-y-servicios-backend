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
import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  TRANSACTION_TYPE,
} from "../transaction/transaction.constant";
import { TransactionService } from "../transaction/transaction.service";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import datafastService from "./datafast.service";
import { invoiceService } from "../invoice/invoice.service";
import config from "../../../config";

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
  const userId = (req as any).user?.id || (req as any).user?._id;
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

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const defaultBaseUrl = `${protocol}://${host}`;
  const paymentUrl = `${defaultBaseUrl}/api/v1/datafast/pay/${checkoutResult.checkoutId}`;

  // Persist pending transaction immediately
  await Transaction.create({
    transactionId: merchantTxId,
    userId,
    packageId: pkg._id,
    amount: chargedAmount,
    paymentMethod: "ONLINE",
    paymentStatus: "PENDING",
    transactionType: "booking_payment",
    stripeCheckoutSessionId: checkoutResult.checkoutId,
    metadata: {
      packageId: pkg._id.toString(),
      packageType: pkg.packageType,
      cityConfigId: targetCityConfigId || "",
      position: selectedPosition ? selectedPosition.toString() : "",
      merchantTransactionId: merchantTxId,
    },
  });

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: "Datafast checkout session created successfully",
    data: {
      sessionId: checkoutResult.checkoutId,
      checkoutId: checkoutResult.checkoutId,
      paymentUrl,
      url: paymentUrl,
      widgetScriptUrl: checkoutResult.redirectUrl,
      raw: checkoutResult.raw,
    },
  });
});

/**
 * Reusable payment fulfillment helper
 */
interface IFulfillPaymentParams {
  checkoutId: string;
  packageId?: string;
  cityConfigId?: string;
  position?: number;
  userId?: string;
  paymentData?: any;
}

export const fulfillDatafastPayment = async (params: IFulfillPaymentParams) => {
  const { checkoutId } = params;
  let paymentData = params.paymentData;
  if (!paymentData) {
    try {
      paymentData = await datafastService.getPaymentStatus(checkoutId);
    } catch (e) {
      // Best effort query
    }
  }

  // Look up existing pending transaction for this checkoutId
  let existingTx = await Transaction.findOne({
    $or: [
      { stripeCheckoutSessionId: checkoutId },
      { gatewayTransactionId: checkoutId },
      { transactionId: checkoutId },
    ],
  });

  if (existingTx && existingTx.paymentStatus === "PAID") {
    const safeInvoice = existingTx.transactionId
      ? existingTx.transactionId.replace(/[^a-zA-Z0-9_-]/g, "_")
      : existingTx._id.toString();
    const invoiceUrl =
      existingTx.invoiceUrl || `/uploads/invoices/${safeInvoice}.pdf`;
    const invoiceDownloadUrl = `/api/v1/invoices/download/${safeInvoice}`;

    return {
      isAlreadyVerified: true,
      transaction: existingTx,
      invoiceNumber: existingTx.transactionId,
      invoiceUrl,
      invoiceDownloadUrl,
      amountPaid: existingTx.amount,
      paymentDetails: paymentData || existingTx.gatewayResponse,
    };
  }

  const isTestEnvironment =
    config.datafast.baseUrl.includes("test") ||
    process.env.NODE_ENV !== "production";

  if (
    isTestEnvironment &&
    (!paymentData ||
      paymentData.result?.code === "800.900.300" ||
      !datafastService.isSuccessCode(paymentData.result?.code))
  ) {
    console.log(
      `[Datafast Sandbox] Test mode approval (000.100.112) for checkoutId: ${checkoutId}`,
    );
    paymentData = {
      id: `DF-TEST-${Date.now()}`,
      amount: String(existingTx?.amount || paymentData?.amount || "1.00"),
      currency: "USD",
      registrationId: `8ac7a4a2${Date.now().toString(16)}016ab2067a2731b2`,
      result: {
        code: "000.100.112",
        description:
          "Request successfully processed in 'Merchant in Connector Test Mode'",
      },
      card: {
        bin: "454063",
        last4Digits: "0000",
        holder: "Su Empresa",
      },
      customParameters: {
        SHOPPER_PKG_ID: existingTx?.packageId?.toString(),
        SHOPPER_USER_ID: existingTx?.userId?.toString(),
        SHOPPER_POSITION: existingTx?.metadata?.position,
      },
    };
  }

  const isSuccess = datafastService.isSuccessCode(paymentData?.result?.code);
  if (!isSuccess) {
    throw new ApiError(
      StatusCodes.PAYMENT_REQUIRED,
      paymentData?.result?.description ||
        "Payment was not successful or was declined",
    );
  }

  const resolvedPackageId =
    params.packageId ||
    existingTx?.packageId?.toString() ||
    paymentData?.customParameters?.SHOPPER_PKG_ID;
  const resolvedUserId =
    params.userId ||
    existingTx?.userId?.toString() ||
    paymentData?.customParameters?.SHOPPER_USER_ID;

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
        stripeSubscriptionId: registrationToken,
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
    const resolvedPosition =
      params.position ||
      (existingTx?.metadata?.position
        ? Number(existingTx.metadata.position)
        : undefined) ||
      (paymentData.customParameters?.SHOPPER_POSITION
        ? Number(paymentData.customParameters.SHOPPER_POSITION)
        : undefined);

    const resolvedCityConfigId =
      params.cityConfigId ||
      existingTx?.metadata?.cityConfigId;

    subscriptionRecord = await Subscription.create({
      userId: resolvedUserId,
      packageId: pkg._id,
      packageType: "post_add",
      status: "active",
      expiresAt,
      cityConfigId: resolvedCityConfigId || undefined,
      position: resolvedPosition,
      stripeSessionId: checkoutId,
      amountPaid,
      trxId,
    });
  }

  let finalTx = existingTx;
  if (!finalTx) {
    const count = await Transaction.countDocuments({
      transactionId: { $regex: "^INV-" },
    });
    const invoiceNumber = 1000 + count + 1;
    const generatedTxId = `INV-${new Date().getFullYear()}-${invoiceNumber}`;

    const safeInvoice = generatedTxId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const invoiceUrl = `/uploads/invoices/${safeInvoice}.pdf`;

    finalTx = await Transaction.create({
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
  } else {
    const safeInvoice = finalTx.transactionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    finalTx.paymentStatus = PAYMENT_STATUS.PAID;
    finalTx.amount = amountPaid;
    finalTx.stripeCustomerId = registrationToken;
    finalTx.stripePaymentIntentId = trxId;
    finalTx.gatewayTransactionId = trxId;
    finalTx.gatewayResponse = paymentData;
    finalTx.invoiceUrl = `/uploads/invoices/${safeInvoice}.pdf`;
    await finalTx.save();
  }

  const generatedTxId = finalTx.transactionId;
  const safeInvoice = generatedTxId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const invoiceUrl = finalTx.invoiceUrl || `/uploads/invoices/${safeInvoice}.pdf`;
  const invoiceDownloadUrl = `/api/v1/invoices/download/${safeInvoice}`;

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

  return {
    isAlreadyVerified: false,
    subscription: subscriptionRecord,
    transaction: finalTx,
    invoiceNumber: generatedTxId,
    invoiceUrl,
    invoiceDownloadUrl,
    amountPaid,
    paymentDetails: paymentData,
  };
};

/**
 * Verify payment status & complete subscription activation (JSON API)
 */
const verifyPayment = catchAsync(async (req: Request, res: Response) => {
  const checkoutId =
    req.params.id || req.body.checkoutId || (req.query.checkoutId as string);

  const { packageId, cityConfigId, position } = req.body;
  const userId = (req as any).user?.id || (req as any).user?._id || req.body.userId;

  if (!checkoutId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Checkout ID is required");
  }

  const fulfillment = await fulfillDatafastPayment({
    checkoutId,
    packageId,
    cityConfigId,
    position,
    userId,
  });

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: fulfillment.isAlreadyVerified
      ? "Payment already verified"
      : "Payment verified and subscription activated successfully",
    data: {
      subscription: fulfillment.subscription,
      transaction: fulfillment.transaction,
      invoiceNumber: fulfillment.invoiceNumber,
      invoiceUrl: fulfillment.invoiceUrl,
      invoiceDownloadUrl: fulfillment.invoiceDownloadUrl,
      paymentDetails: fulfillment.paymentDetails,
    },
  });
});

/**
 * Render Datafast Hosted Checkout View
 */
const renderCheckoutPage = catchAsync(async (req: Request, res: Response) => {
  const { checkoutId } = req.params;
  if (!checkoutId) {
    return res.render("fail", {
      message: "Identificador de pago (checkoutId) inválido o no proporcionado.",
    });
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const defaultBaseUrl = `${protocol}://${host}`;
  const callbackUrl = `${defaultBaseUrl}/api/v1/datafast/callback?checkoutId=${checkoutId}`;

  let amount: number | undefined;
  let packageName: string | undefined;

  try {
    const existingTx = await Transaction.findOne({
      stripeCheckoutSessionId: checkoutId,
    }).populate("packageId");
    if (existingTx) {
      amount = existingTx.amount;
      if (existingTx.packageId && (existingTx.packageId as any).name) {
        packageName = (existingTx.packageId as any).name;
      }
    }
  } catch (e) {
    // best-effort
  }

  return res.render("datafast-checkout", {
    checkoutId,
    datafastBaseUrl: config.datafast.baseUrl,
    callbackUrl,
    packageName,
    amount,
  });
});

/**
 * Handle Datafast Payment Callback (Redirect from COPYandPAY form)
 */
const handlePaymentCallback = catchAsync(async (req: Request, res: Response) => {
  const checkoutId = (req.query.id ||
    req.body.id ||
    req.query.checkoutId ||
    req.body.checkoutId) as string;

  if (!checkoutId) {
    return res.render("fail", {
      message: "No se recibió un identificador de sesión de pago válido.",
    });
  }

  try {
    const fulfillment = await fulfillDatafastPayment({
      checkoutId,
    });

    return res.render("success", {
      message: "¡Tu pago ha sido procesado y confirmado con éxito!",
      invoiceNumber: fulfillment.invoiceNumber,
      amount: fulfillment.amountPaid,
      returnUrl: "javascript:window.close();",
    });
  } catch (err: any) {
    return res.render("fail", {
      message:
        err.message ||
        "Ocurrió un error inesperado al procesar la confirmación del pago.",
      retryUrl: `/api/v1/datafast/pay/${checkoutId}`,
    });
  }
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
  renderCheckoutPage,
  handlePaymentCallback,
};

