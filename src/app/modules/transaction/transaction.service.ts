import mongoose, { ClientSession, Types } from "mongoose";
import { ITransaction } from "./transaction.interface";
import { Transaction } from "./transaction.model";
import {
  TRANSACTION_TYPE,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
} from "./transaction.constant";
import { User } from "../user/user.model";
import { getDayRangeInTimezone } from "../../../shared/timezoneHelper";
import { DateTime } from "luxon";
import { Store } from "../store/store.model";
import { SubscriptionPackage } from "../subscriptionPackage/subscriptionPackage.model";
import { Subscription } from "../subscription/subscription.model";
import datafastService from "../datafast/datafast.service";
import ApiError from "../../../errors/ApiErrors";
import { StatusCodes } from "http-status-codes";

const generateTransactionId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${dateStr}-${randomSuffix}`;
};

const createTransaction = async (
  data: Partial<ITransaction>,
  session?: ClientSession,
): Promise<ITransaction> => {
  if (!data.transactionId) {
    data.transactionId = generateTransactionId();
  }

  const [transaction] = await Transaction.create([data], { session });
  return transaction;
};

const getTransactionsByUser = async (
  userId: string,
  role?: string,
  filter: string = "all",
): Promise<any[]> => {
  const userObjectId = new Types.ObjectId(userId);

  // If role is not passed, retrieve it from User collection
  let userRole = role;
  if (!userRole) {
    const user = await User.findById(userId);
    userRole = user?.role || "user";
  }

  // Build the base query for User/Seller
  const query: any = {
    userId: userObjectId,
    paymentStatus: { $in: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED] },
  };

  // Handle filter values
  let normalizedFilter = "all";
  if (filter) {
    const f = filter.toLowerCase();
    if (
      f === "refund" ||
      f === "add_money" ||
      f === "add-money" ||
      f === "addmoney" ||
      f === "add"
    ) {
      normalizedFilter = "refund";
    } else if (f === "spend" || f === "payment") {
      normalizedFilter = "spend";
    } else if (f === "subscription" || f === "subscription_payment") {
      normalizedFilter = "subscription";
    } else if (f === "advertisement" || f === "advertisement_payment") {
      normalizedFilter = "advertisement";
    }
  }

  if (normalizedFilter === "refund") {
    query.transactionType = TRANSACTION_TYPE.REFUND;
  } else if (normalizedFilter === "subscription") {
    query.transactionType = {
      $in: [
        TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT,
        TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      ],
    };
  } else if (normalizedFilter === "advertisement") {
    query.transactionType = TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT;
  } else if (normalizedFilter === "spend") {
    query.transactionType = {
      $in: [
        TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT,
        TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT,
        TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      ],
    };
  }

  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .populate("userId", "name email")
    .populate("packageId", "name");

  return transactions.map((tx) => {
    const txObj = tx.toObject();
    const txType = txObj.transactionType;
    const flowType = txType === TRANSACTION_TYPE.REFUND ? "add_money" : "spend";

    const safeInvoice = txObj.transactionId
      ? txObj.transactionId.replace(/[^a-zA-Z0-9_-]/g, "_")
      : null;
    const invoiceUrl =
      txObj.invoiceUrl ||
      (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
    const invoiceDownloadUrl = safeInvoice
      ? `/api/v1/invoices/download/${safeInvoice}`
      : `/api/v1/invoices/download/${txObj._id}`;

    return {
      ...txObj,
      invoiceNumber: txObj.transactionId,
      invoiceUrl,
      invoiceDownloadUrl,
      type: flowType,
    };
  });
};

const getTransactions = async (
  userId: string,
  role: string,
  queryOptions: {
    filter?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    status?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<any> => {
  const platformCurrency = "USD";
  const userObjectId = new Types.ObjectId(userId);
  const matchQuery: any = {};

  // Resolve timezone dynamically
  const defaultTimezone = "Asia/Dhaka";
  let userTimezone = defaultTimezone;
  const user = await User.findById(userId);
  if (user && user.timezone) {
    userTimezone = user.timezone;
  }

  // 1. User matching logic
  matchQuery.userId = userObjectId;

  // 2. Status filter
  if (queryOptions.status) {
    matchQuery.paymentStatus = queryOptions.status.toLowerCase();
  } else {
    matchQuery.paymentStatus = {
      $in: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED],
    };
  }

  // 3. Filter mapping
  const rawFilter = queryOptions.filter || "all";
  const filter = rawFilter.toLowerCase();

  if (filter === "subscription" || filter === "subscription_payment") {
    matchQuery.transactionType = {
      $in: [
        TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT,
        TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      ],
    };
  } else if (filter === "advertisement" || filter === "advertisement_payment") {
    matchQuery.transactionType = TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT;
  } else if (filter === "refund" || filter === "add_money") {
    matchQuery.transactionType = TRANSACTION_TYPE.REFUND;
  } else if (filter === "spend") {
    matchQuery.transactionType = {
      $in: [
        TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT,
        TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT,
        TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      ],
    };
  }

  // 4. Date Range
  if (queryOptions.startDate || queryOptions.endDate) {
    matchQuery.createdAt = {};
    if (queryOptions.startDate) {
      const { start } = getDayRangeInTimezone(
        queryOptions.startDate,
        userTimezone,
      );
      matchQuery.createdAt.$gte = start;
    }
    if (queryOptions.endDate) {
      const { end } = getDayRangeInTimezone(queryOptions.endDate, userTimezone);
      matchQuery.createdAt.$lte = end;
    }
  }

  // 5. Search
  if (queryOptions.search) {
    const searchRegex = new RegExp(queryOptions.search, "i");
    const orConditions: any[] = [{ transactionId: searchRegex }];

    if (Types.ObjectId.isValid(queryOptions.search)) {
      orConditions.push({ _id: new Types.ObjectId(queryOptions.search) });
    }

    matchQuery.$and = matchQuery.$and || [];
    matchQuery.$and.push({ $or: orConditions });
  }

  // 6. Pagination & Sorting setup
  const page = Number(queryOptions.page) || 1;
  const limit = Number(queryOptions.limit) || 10;
  const skip = (page - 1) * limit;

  const sortBy = queryOptions.sortBy || "createdAt";
  const sortOrder = queryOptions.sortOrder?.toLowerCase() === "asc" ? 1 : -1;
  const sort: any = { [sortBy]: sortOrder };

  // Execute count and query concurrently
  const [total, transactions] = await Promise.all([
    Transaction.countDocuments(matchQuery),
    Transaction.find(matchQuery)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email")
      .populate("packageId", "name price duration"),
  ]);

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Map transactions to standardized structure
  const data = transactions.map((tx) => {
    const txObj = tx.toObject ? tx.toObject() : tx;
    const id = txObj._id;
    const transactionId = txObj.transactionId;
    const createdAt = txObj.createdAt;
    const currency = txObj.currency || platformCurrency.toUpperCase();

    // Subtitle formatting using resolved user's timezone
    const dt = DateTime.fromJSDate(createdAt).setZone(userTimezone);
    const dStr = dt.toFormat("LLL d, yyyy");
    const tStr = dt.toFormat("h:mm a");
    const subtitle = `${dStr} • ${tStr}`;

    // Status mapping
    let status = "success";
    if (txObj.paymentStatus === PAYMENT_STATUS.PENDING) {
      status = "pending";
    } else if (txObj.paymentStatus === PAYMENT_STATUS.FAILED) {
      status = "failed";
    } else if (txObj.paymentStatus === PAYMENT_STATUS.REFUNDED) {
      status = "refunded";
    }

    let amount = txObj.amount;
    let transactionType: string = txObj.transactionType;
    let title = "Transaction";
    let icon = "credit-card";
    let displayColor = "emerald";
    let type = "SPEND";

    const txType = txObj.transactionType;

    if (
      txType === TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT ||
      txType === TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL
    ) {
      transactionType =
        txType === TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL
          ? "SUBSCRIPTION_RENEWAL"
          : "SUBSCRIPTION_PAYMENT";
      const pkgName = (txObj.packageId as any)?.name;
      title = pkgName
        ? `Suscripción: ${pkgName}`
        : "Suscripción de Tienda";
      icon = "store";
      displayColor = "emerald";
      type = "SPEND";
      amount = txObj.amount;
    } else if (txType === TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT) {
      transactionType = "ADVERTISEMENT_PAYMENT";
      const pos = txObj.metadata?.position || 1;
      const city = txObj.metadata?.cityName || "";
      title = `Anuncio Publicitario - Posición ${pos}${city ? ` (${city})` : ""}`;
      icon = "tag";
      displayColor = "emerald";
      type = "SPEND";
      amount = txObj.amount;
    } else if (txType === TRANSACTION_TYPE.REFUND) {
      transactionType = "REFUND";
      title = "Reembolso Acreditado";
      icon = "arrow-down-left";
      displayColor = "green";
      type = "ADD_MONEY";
      amount = Math.abs(txObj.amount);
    } else {
      transactionType = "PAYMENT";
      title = txObj.description || "Pago de Servicio";
      icon = "credit-card";
      displayColor = "emerald";
      type = "SPEND";
      amount = txObj.amount;
    }

    const safeInvoice = transactionId
      ? transactionId.replace(/[^a-zA-Z0-9_-]/g, "_")
      : null;
    const invoiceUrl =
      txObj.invoiceUrl ||
      (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
    const invoiceDownloadUrl = safeInvoice
      ? `/api/v1/invoices/download/${safeInvoice}`
      : `/api/v1/invoices/download/${id}`;

    return {
      id,
      transactionId,
      invoiceNumber: transactionId,
      invoiceUrl,
      invoiceDownloadUrl,
      type,
      title,
      subtitle,
      status,
      amount,
      currency,
      transactionType,
      icon,
      displayColor,
      createdAt,
      actions: {
        canView: true,
        canDelete: false,
      },
    };
  });

  return {
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
    data,
  };
};

const getAllSubscriptionTransactions = async (queryOptions: {
  searchTerm?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<any> => {
  const matchQuery: any = {};

  // 1. Status Filter
  if (
    queryOptions.status &&
    queryOptions.status !== "all" &&
    queryOptions.status !== "All statuses"
  ) {
    // Map status from friendly name to stored enum values (PAID, FAILED, PENDING, REFUNDED)
    const normalizedStatus = queryOptions.status.toUpperCase();
    matchQuery.paymentStatus = normalizedStatus;
  }

  // 2. Search logic (Search by store display name, plan name, or invoice/transactionId)
  if (queryOptions.searchTerm) {
    const searchRegex = new RegExp(queryOptions.searchTerm, "i");

    // Run store and package matching in parallel
    const [matchingStores, matchingPackages] = await Promise.all([
      Store.find({ displayName: { $regex: searchRegex } }).select("owner").lean(),
      SubscriptionPackage.find({ name: { $regex: searchRegex } }).select("_id").lean(),
    ]);

    const ownerIds = matchingStores.map((store: any) => store.owner);
    const packageIds = matchingPackages.map((pkg: any) => pkg._id);

    matchQuery.$or = [
      { transactionId: { $regex: searchRegex } },
      { userId: { $in: ownerIds } },
      { packageId: { $in: packageIds } },
    ];
  }

  // Pagination & Sorting setup
  const page = Number(queryOptions.page) || 1;
  const limit = Number(queryOptions.limit) || 10;
  const skip = (page - 1) * limit;

  // Execute count and paginated find in parallel
  const [total, transactions] = await Promise.all([
    Transaction.countDocuments(matchQuery),
    Transaction.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email timezone")
      .populate("packageId", "name")
      .lean(),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Batch fetch all stores for the users on this page in ONE query (eliminates N+1 queries)
  const userIds = [
    ...new Set(
      transactions
        .map((tx: any) => tx.userId?._id?.toString() || tx.userId?.toString())
        .filter(Boolean),
    ),
  ];

  const stores =
    userIds.length > 0
      ? await Store.find({ owner: { $in: userIds } })
          .select("displayName owner")
          .lean()
      : [];

  const storeMap = new Map<string, any>(
    stores.map((s: any) => [s.owner.toString(), s]),
  );

  // Format to match exact frontend columns:
  // INVOICE, STORE, PLAN, METHOD, AMOUNT, DATE, STATUS, Refund action
  const data = transactions.map((tx: any) => {
    const userIdStr = tx.userId?._id?.toString() || tx.userId?.toString() || "";
    const store = storeMap.get(userIdStr);

    // Friendly method name mapping
    let method = "Datafast";
    if (tx.metadata?.paymentBrand || tx.metadata?.cardType) {
      method = `Datafast (${tx.metadata.paymentBrand || tx.metadata.cardType})`;
    }

    // Format date: e.g. "Aug 16, 2026"
    const txTimezone = tx.userId?.timezone || "Asia/Dhaka";
    const dateStr = tx.createdAt
      ? DateTime.fromJSDate(new Date(tx.createdAt))
          .setZone(txTimezone)
          .toFormat("LLL d, yyyy")
      : "";

    // Format status (camel case/badge friendly)
    // e.g. Paid, Failed, Pending, Refunded
    let status = "Pending";
    if (tx.paymentStatus === PAYMENT_STATUS.PAID) {
      status = "Paid";
    } else if (tx.paymentStatus === PAYMENT_STATUS.FAILED) {
      status = "Failed";
    } else if (tx.paymentStatus === PAYMENT_STATUS.REFUNDED) {
      status = "Refunded";
    }

    const planName = tx.packageId?.name || "N/A";

    const safeInvoice = tx.transactionId
      ? tx.transactionId.replace(/[^a-zA-Z0-9_-]/g, "_")
      : null;
    const invoiceUrl =
      tx.invoiceUrl ||
      (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
    const invoiceDownloadUrl = safeInvoice
      ? `/api/v1/invoices/download/${safeInvoice}`
      : `/api/v1/invoices/download/${tx._id}`;

    return {
      _id: tx._id,
      invoice: tx.transactionId,
      invoiceNumber: tx.transactionId,
      invoiceUrl,
      invoiceDownloadUrl,
      store: store
        ? store.displayName || "N/A"
        : tx.userId?.name || "N/A",
      plan: planName,
      method,
      amount: tx.amount,
      date: dateStr,
      status,
      canRefund: tx.paymentStatus === PAYMENT_STATUS.PAID,
    };
  });

  return {
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
    data,
  };
};


const refundTransactionFromDB = async (id: string): Promise<any> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid Transaction ID");
  }

  const transaction = await Transaction.findById(id);
  if (!transaction) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Transaction not found");
  }

  if (transaction.paymentStatus !== PAYMENT_STATUS.PAID) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Only paid transactions can be refunded",
    );
  }

  const gatewayTxId = transaction.gatewayTransactionId;
  if (!gatewayTxId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "No gateway transaction ID found for this transaction",
    );
  }

  try {
    const refund = await datafastService.refundPayment(
      gatewayTxId,
      transaction.amount,
    );

    // Update transaction
    transaction.paymentStatus = PAYMENT_STATUS.REFUNDED;
    await transaction.save();

    // Cancel the corresponding Subscription
    const subscription = await Subscription.findOne({
      $or: [
        { trxId: gatewayTxId },
        { checkoutSessionId: transaction.checkoutSessionId },
      ],
    });

    if (subscription) {
      subscription.status = "canceled";
      await subscription.save();

      // Update user status
      await User.findByIdAndUpdate(subscription.userId, {
        subscriptionStatus: "canceled",
        subscriptionExpiresAt: new Date(),
      });
    }

    return transaction;
  } catch (error: any) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      error.message || "Failed to process refund via Datafast",
    );
  }
};

export const TransactionService = {
  createTransaction,
  getTransactionsByUser,
  getTransactions,
  getAllSubscriptionTransactions,
  refundTransactionFromDB,
};
