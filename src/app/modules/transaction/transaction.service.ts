import mongoose, { ClientSession, Types } from "mongoose";
import { ITransaction } from "./transaction.interface";
import { Transaction } from "./transaction.model";
import {
  TRANSACTION_TYPE,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
} from "./transaction.constant";
import { User } from "../user/user.model";
import { DateTime } from "luxon";
import { Store } from "../store/store.model";
import { SubscriptionPackage } from "../subscriptionPackage/subscriptionPackage.model";
import { Subscription } from "../subscription/subscription.model";
import { CityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.model";
import { Advertisement } from "../advertisement/advertisement.model";
import datafastService from "../datafast/datafast.service";
import ApiError from "../../../errors/ApiErrors";
import { StatusCodes } from "http-status-codes";
import { USER_ROLES } from "../../../enums/user";

/**
 * Format subscription package duration into user-friendly text
 */
const formatDuration = (duration?: string): string => {
  switch (duration) {
    case "seven_days":
      return "7 Days";
    case "one_month":
      return "1 Month (30 Days)";
    case "three_month":
      return "3 Months";
    case "six_month":
      return "6 Months";
    case "one_year":
      return "1 Year";
    default:
      return duration ? duration.replace(/_/g, " ") : "N/A";
  }
};

/**
 * Generate unique transaction ID fallback
 */
const generateTransactionId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${dateStr}-${randomSuffix}`;
};

/**
 * Create a new Transaction record
 */
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

/**
 * Get authenticated user's/seller's transactions with full details
 * for both recurring subscriptions and one-time post ad payments.
 */
const getMyTransactionsFromDB = async (
  userId: string,
  userRole: string,
  queryOptions: {
    type?: string;
    filter?: string;
    status?: string;
    search?: string;
    searchTerm?: string;
    startDate?: string;
    endDate?: string;
    page?: number | string;
    limit?: number | string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  },
): Promise<any> => {
  const userObjectId = new Types.ObjectId(userId);
  const matchQuery: any = {
    userId: userObjectId,
    isDeleted: { $ne: true },
  };

  // 1. Status Filter
  if (
    queryOptions.status &&
    queryOptions.status.toLowerCase() !== "all" &&
    queryOptions.status.toLowerCase() !== "all statuses"
  ) {
    matchQuery.paymentStatus = queryOptions.status.toUpperCase();
  }

  // 2. Filter / Type mapping (subscription, post_add / advertisement, refund, all)
  const rawFilter = (queryOptions.type || queryOptions.filter || "all")
    .toLowerCase()
    .trim();

  if (
    rawFilter === "subscription" ||
    rawFilter === "subscriptions" ||
    rawFilter === "subscription_payment" ||
    rawFilter === "recurring"
  ) {
    matchQuery.transactionType = {
      $in: [
        TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT,
        TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
      ],
    };
  } else if (
    rawFilter === "advertisement" ||
    rawFilter === "advertisements" ||
    rawFilter === "advertisement_payment" ||
    rawFilter === "post_add" ||
    rawFilter === "post-add" ||
    rawFilter === "postadd" ||
    rawFilter === "one_time" ||
    rawFilter === "one-time" ||
    rawFilter === "ad"
  ) {
    matchQuery.transactionType = TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT;
  } else if (
    rawFilter === "refund" ||
    rawFilter === "add_money" ||
    rawFilter === "add-money"
  ) {
    matchQuery.transactionType = TRANSACTION_TYPE.REFUND;
  } else if (rawFilter === "spend" || rawFilter === "payment") {
    matchQuery.transactionType = {
      $in: [
        TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT,
        TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
        TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT,
      ],
    };
  }

  // 3. Date Range
  if (queryOptions.startDate || queryOptions.endDate) {
    matchQuery.createdAt = {};
    if (queryOptions.startDate) {
      matchQuery.createdAt.$gte = new Date(queryOptions.startDate);
    }
    if (queryOptions.endDate) {
      const end = new Date(queryOptions.endDate);
      end.setHours(23, 59, 59, 999);
      matchQuery.createdAt.$lte = end;
    }
  }

  // 4. Search
  const search = queryOptions.search || queryOptions.searchTerm;
  if (search && search.trim() !== "") {
    const searchRegex = new RegExp(search.trim(), "i");
    const [matchingPackages, matchingCities] = await Promise.all([
      SubscriptionPackage.find({ name: { $regex: searchRegex } })
        .select("_id")
        .lean(),
      CityAdConfiguration.find({
        $or: [
          { city: { $regex: searchRegex } },
          { province: { $regex: searchRegex } },
          { canton: { $regex: searchRegex } },
          { neighborhood: { $regex: searchRegex } },
        ],
      })
        .select("_id")
        .lean(),
    ]);

    const pkgIds = matchingPackages.map((p: any) => p._id);
    const cityIds = matchingCities.map((c: any) => c._id.toString());

    const orConditions: any[] = [
      { transactionId: { $regex: searchRegex } },
      { gatewayTransactionId: { $regex: searchRegex } },
      { description: { $regex: searchRegex } },
      { "metadata.cityName": { $regex: searchRegex } },
      { "metadata.merchantTransactionId": { $regex: searchRegex } },
      { packageId: { $in: pkgIds } },
      { "metadata.cityConfigId": { $in: cityIds } },
    ];

    if (Types.ObjectId.isValid(search.trim())) {
      orConditions.push({ _id: new Types.ObjectId(search.trim()) });
    }

    matchQuery.$and = matchQuery.$and || [];
    matchQuery.$and.push({ $or: orConditions });
  }

  // 5. Pagination & Sorting setup
  const page = Math.max(1, Number(queryOptions.page) || 1);
  const limit = Math.max(1, Number(queryOptions.limit) || 10);
  const skip = (page - 1) * limit;

  const sortBy = queryOptions.sortBy || "createdAt";
  const sortOrder = queryOptions.sortOrder?.toLowerCase() === "asc" ? 1 : -1;
  const sort: any = { [sortBy]: sortOrder };

  // 6. Query DB
  const [total, transactions] = await Promise.all([
    Transaction.countDocuments(matchQuery),
    Transaction.find(matchQuery)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email timezone")
      .populate("packageId")
      .lean(),
  ]);

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // 7. Batch lookups for related entities
  const cityConfigIds = [
    ...new Set(
      transactions
        .map((t: any) => t.metadata?.cityConfigId)
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  ];
  const txIds = transactions.map((t: any) => t._id);

  const [cities, ads, subscriptions, store] = await Promise.all([
    cityConfigIds.length > 0
      ? CityAdConfiguration.find({ _id: { $in: cityConfigIds } }).lean()
      : [],
    Advertisement.find({
      $or: [{ transactionId: { $in: txIds } }, { sellerId: userObjectId }],
      isDeleted: { $ne: true },
    }).lean(),
    Subscription.find({
      userId: userObjectId,
      isDeleted: { $ne: true },
    }).lean(),
    Store.findOne({ owner: userObjectId }).select("displayName logo").lean(),
  ]);

  const cityMap = new Map<string, any>(
    cities.map((c: any) => [c._id.toString(), c]),
  );

  const now = new Date();

  // 8. Standardize & enrich transaction objects
  const data = transactions.map((tx: any) => {
    const isSubscription =
      tx.transactionType === TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT ||
      tx.transactionType === TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL ||
      tx.metadata?.bookingType === "store_creation" ||
      Boolean(tx.packageId);

    const isPostAdd =
      tx.transactionType === TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT ||
      tx.metadata?.bookingType === "advertisement" ||
      Boolean(tx.metadata?.cityConfigId);

    const isRefund = tx.transactionType === TRANSACTION_TYPE.REFUND;

    // Safe invoice URLs
    const safeInvoice = tx.transactionId
      ? tx.transactionId.replace(/[^a-zA-Z0-9_-]/g, "_")
      : null;
    const invoiceUrl =
      tx.invoiceUrl ||
      (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
    const invoiceDownloadUrl = safeInvoice
      ? `/api/v1/invoices/download/${safeInvoice}`
      : `/api/v1/invoices/download/${tx._id}`;

    // Subtitle formatting using user's timezone
    const userTz = tx.userId?.timezone || "Asia/Dhaka";
    const dt = tx.createdAt
      ? DateTime.fromJSDate(new Date(tx.createdAt)).setZone(userTz)
      : DateTime.now().setZone(userTz);
    const subtitle = `${dt.toFormat("LLL d, yyyy")} • ${dt.toFormat("h:mm a")}`;

    const pkg = tx.packageId;

    // Resolve subscription doc (if subscription)
    const subDoc = subscriptions.find(
      (s: any) =>
        (tx.checkoutSessionId &&
          s.checkoutSessionId === tx.checkoutSessionId) ||
        (tx.gatewayTransactionId && s.trxId === tx.gatewayTransactionId) ||
        (tx.transactionId && s.invoiceNumber === tx.transactionId) ||
        (pkg?._id && s.packageId?.toString() === pkg._id.toString()),
    );

    let subExpiresAt = subDoc?.expiresAt || null;
    let subRemainingDays = 0;
    let subIsExpired = false;
    if (subExpiresAt) {
      const expDate = new Date(subExpiresAt);
      subIsExpired = expDate <= now;
      const diffMs = expDate.getTime() - now.getTime();
      subRemainingDays =
        diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
    }

    // Resolve city & advertisement (if post ad)
    const cityConfigId = tx.metadata?.cityConfigId;
    const cityConfig = cityConfigId
      ? cityMap.get(cityConfigId.toString())
      : null;

    const ad = ads.find((a: any) => {
      if (a.transactionId && a.transactionId.toString() === tx._id.toString()) {
        return true;
      }
      return false;
    });

    const cityName =
      cityConfig?.city || tx.metadata?.cityName || ad?.city || "";
    const province =
      cityConfig?.province || tx.metadata?.province || ad?.province || "";
    const sector =
      cityConfig?.sector || tx.metadata?.sector || ad?.sector || "";
    const neighborhood =
      cityConfig?.neighborhood ||
      tx.metadata?.neighborhood ||
      ad?.neighborhood ||
      "";
    const country =
      cityConfig?.country || tx.metadata?.country || ad?.country || "Ecuador";

    const slotPosition = Number(tx.metadata?.position || ad?.position) || 1;
    const durationDays =
      Number(tx.metadata?.durationDays || cityConfig?.featuredDurationDays) ||
      7;

    // Category, paymentType and title
    let title = "Transacción";
    let category: "subscription" | "post_add" | "refund" | "other" = "other";
    let paymentType: "recurring" | "one_time" | "refund" = "one_time";
    let icon = "credit-card";
    let displayColor = "emerald";

    if (isSubscription) {
      category = "subscription";
      paymentType =
        tx.transactionType === TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL
          ? "recurring"
          : "recurring";
      title = pkg?.name
        ? `Suscripción: ${pkg.name}`
        : tx.description || "Suscripción de Tienda";
      icon = "store";
      displayColor = "emerald";
    } else if (isPostAdd) {
      category = "post_add";
      paymentType = "one_time";
      if (ad?.campaignName) {
        title = `Anuncio: ${ad.campaignName} (Pos. #${slotPosition})`;
      } else if (cityName) {
        title = `Anuncio Publicitario - Posición ${slotPosition} (${cityName})`;
      } else {
        title =
          tx.description || `Anuncio Publicitario - Posición ${slotPosition}`;
      }
      icon = "tag";
      displayColor = "emerald";
    } else if (isRefund) {
      category = "refund";
      paymentType = "refund";
      title = "Reembolso Acreditado";
      icon = "arrow-down-left";
      displayColor = "green";
    }

    const subscriptionPayload = isSubscription
      ? {
          packageId: pkg?._id || null,
          name: pkg?.name || "N/A",
          price: pkg?.price ?? tx.amount,
          duration: pkg?.duration || null,
          durationFormatted: pkg?.duration
            ? formatDuration(pkg.duration)
            : null,
          packageType: pkg?.packageType || "store_creation",
          features: pkg?.features || [],
          listingLimit: pkg?.listingLimit,
          isUnlimitedListings: pkg?.isUnlimitedListings,
          status:
            subDoc?.status ||
            (tx.paymentStatus === PAYMENT_STATUS.PAID
              ? "active"
              : tx.paymentStatus.toLowerCase()),
          expiresAt: subExpiresAt,
          remainingDays: subRemainingDays,
          isExpired: subIsExpired,
        }
      : null;

    const postAddPayload = isPostAdd
      ? {
          bookingType: "advertisement",
          position: slotPosition,
          durationDays,
          city: {
            id: cityConfig?._id || tx.metadata?.cityConfigId || null,
            name: cityName,
            province,
            sector,
            neighborhood,
            country,
          },
          advertisement: ad
            ? {
                id: ad._id,
                campaignName: ad.campaignName,
                featuredImage: ad.featuredImage || null,
                status: ad.status,
                startDate: ad.startDate,
                endDate: ad.endDate,
                price: ad.price,
              }
            : null,
        }
      : null;

    return {
      _id: tx._id,
      id: tx._id,
      transactionId: tx.transactionId,
      invoiceNumber: tx.transactionId,
      invoiceUrl,
      invoiceDownloadUrl,
      amount: tx.amount,
      fee: tx.fee || 0,
      currency: tx.currency || "USD",
      paymentMethod: tx.paymentMethod,
      paymentStatus: tx.paymentStatus,
      transactionType: tx.transactionType,
      category,
      paymentType,
      title,
      subtitle,
      description: tx.description || "",
      icon,
      displayColor,
      store: store
        ? {
            id: store._id,
            displayName: store.displayName,
            logo: store.logo,
          }
        : null,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      actions: {
        canView: true,
        canDownloadInvoice: Boolean(invoiceUrl || invoiceDownloadUrl),
        canRefund: tx.paymentStatus === PAYMENT_STATUS.PAID,
      },
      subscription: subscriptionPayload,
      postAdd: postAddPayload,
      advertisement: postAddPayload,
      metadata: tx.metadata || {},
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

/**
 * Get single transaction details by ID or transaction reference
 */
const getSingleTransactionFromDB = async (
  id: string,
  user: any,
): Promise<any> => {
  const isObjectId = Types.ObjectId.isValid(id);
  const query: any[] = [
    { transactionId: id },
    { gatewayTransactionId: id },
    { checkoutSessionId: id },
  ];
  if (isObjectId) {
    query.push({ _id: new Types.ObjectId(id) });
  }

  const transaction = await Transaction.findOne({
    $or: query,
    isDeleted: { $ne: true },
  })
    .populate("userId", "name email phone profileImage timezone role")
    .populate("packageId")
    .lean();

  if (!transaction) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Transaction not found");
  }

  const isAdmin =
    user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  const txUserId =
    (transaction.userId as any)?._id?.toString() ||
    transaction.userId?.toString();

  if (!isAdmin && txUserId !== user.id && txUserId !== user._id) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to view this transaction",
    );
  }

  // Lookups for enrichment
  const cityConfigId = transaction.metadata?.cityConfigId;
  const [cityConfig, ad, subscriptionDoc, store] = await Promise.all([
    cityConfigId && Types.ObjectId.isValid(cityConfigId)
      ? CityAdConfiguration.findById(cityConfigId).lean()
      : null,
    Advertisement.findOne({
      $or: [
        { transactionId: transaction._id },
        { sellerId: (transaction.userId as any)?._id || transaction.userId },
      ],
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .lean(),
    Subscription.findOne({
      userId: (transaction.userId as any)?._id || transaction.userId,
      $or: [
        { checkoutSessionId: transaction.checkoutSessionId },
        { trxId: transaction.gatewayTransactionId },
        { invoiceNumber: transaction.transactionId },
        {
          packageId:
            (transaction.packageId as any)?._id || transaction.packageId,
        },
      ],
      isDeleted: { $ne: true },
    }).lean(),
    Store.findOne({
      owner: (transaction.userId as any)?._id || transaction.userId,
    }).lean(),
  ]);

  const isSubscription =
    transaction.transactionType === TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT ||
    transaction.transactionType === TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL ||
    transaction.metadata?.bookingType === "store_creation" ||
    Boolean(transaction.packageId);

  const isPostAdd =
    transaction.transactionType === TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT ||
    transaction.metadata?.bookingType === "advertisement" ||
    Boolean(transaction.metadata?.cityConfigId);

  const isRefund = transaction.transactionType === TRANSACTION_TYPE.REFUND;

  const safeInvoice = transaction.transactionId
    ? transaction.transactionId.replace(/[^a-zA-Z0-9_-]/g, "_")
    : null;
  const invoiceUrl =
    transaction.invoiceUrl ||
    (safeInvoice ? `/uploads/invoices/${safeInvoice}.pdf` : null);
  const invoiceDownloadUrl = safeInvoice
    ? `/api/v1/invoices/download/${safeInvoice}`
    : `/api/v1/invoices/download/${transaction._id}`;

  const userTz = (transaction.userId as any)?.timezone || "Asia/Dhaka";
  const dt = transaction.createdAt
    ? DateTime.fromJSDate(new Date(transaction.createdAt)).setZone(userTz)
    : DateTime.now().setZone(userTz);
  const subtitle = `${dt.toFormat("LLL d, yyyy")} • ${dt.toFormat("h:mm a")}`;

  const pkg = transaction.packageId as any;
  const now = new Date();

  let subExpiresAt = subscriptionDoc?.expiresAt || null;
  let subRemainingDays = 0;
  let subIsExpired = false;
  if (subExpiresAt) {
    const expDate = new Date(subExpiresAt);
    subIsExpired = expDate <= now;
    const diffMs = expDate.getTime() - now.getTime();
    subRemainingDays =
      diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
  }

  const cityName =
    cityConfig?.city || transaction.metadata?.cityName || ad?.city || "";
  const province =
    cityConfig?.province ||
    transaction.metadata?.province ||
    ad?.province ||
    "";
  const sector =
    cityConfig?.sector || transaction.metadata?.sector || ad?.sector || "";
  const neighborhood =
    cityConfig?.neighborhood ||
    transaction.metadata?.neighborhood ||
    ad?.neighborhood ||
    "";
  const country =
    cityConfig?.country ||
    transaction.metadata?.country ||
    ad?.country ||
    "Ecuador";

  const slotPosition =
    Number(transaction.metadata?.position || ad?.position) || 1;
  const durationDays =
    Number(
      transaction.metadata?.durationDays || cityConfig?.featuredDurationDays,
    ) || 7;

  let title = "Transacción";
  let category: "subscription" | "post_add" | "refund" | "other" = "other";
  let paymentType: "recurring" | "one_time" | "refund" = "one_time";
  let icon = "credit-card";
  let displayColor = "emerald";

  if (isSubscription) {
    category = "subscription";
    paymentType = "recurring";
    title = pkg?.name
      ? `Suscripción: ${pkg.name}`
      : transaction.description || "Suscripción de Tienda";
    icon = "store";
    displayColor = "emerald";
  } else if (isPostAdd) {
    category = "post_add";
    paymentType = "one_time";
    if (ad?.campaignName) {
      title = `Anuncio: ${ad.campaignName} (Pos. #${slotPosition})`;
    } else if (cityName) {
      title = `Anuncio Publicitario - Posición ${slotPosition} (${cityName})`;
    } else {
      title =
        transaction.description ||
        `Anuncio Publicitario - Posición ${slotPosition}`;
    }
    icon = "tag";
    displayColor = "emerald";
  } else if (isRefund) {
    category = "refund";
    paymentType = "refund";
    title = "Reembolso Acreditado";
    icon = "arrow-down-left";
    displayColor = "green";
  }

  const subscriptionPayload = isSubscription
    ? {
        packageId: pkg?._id || null,
        name: pkg?.name || "N/A",
        price: pkg?.price ?? transaction.amount,
        duration: pkg?.duration || null,
        durationFormatted: pkg?.duration ? formatDuration(pkg.duration) : null,
        packageType: pkg?.packageType || "store_creation",
        features: pkg?.features || [],
        listingLimit: pkg?.listingLimit,
        isUnlimitedListings: pkg?.isUnlimitedListings,
        status:
          subscriptionDoc?.status ||
          (transaction.paymentStatus === PAYMENT_STATUS.PAID
            ? "active"
            : transaction.paymentStatus.toLowerCase()),
        expiresAt: subExpiresAt,
        remainingDays: subRemainingDays,
        isExpired: subIsExpired,
      }
    : null;

  const postAddPayload = isPostAdd
    ? {
        bookingType: "advertisement",
        position: slotPosition,
        durationDays,
        city: {
          id: cityConfig?._id || transaction.metadata?.cityConfigId || null,
          name: cityName,
          province,
          sector,
          neighborhood,
          country,
        },
        advertisement: ad
          ? {
              id: ad._id,
              campaignName: ad.campaignName,
              featuredImage: ad.featuredImage || null,
              status: ad.status,
              startDate: ad.startDate,
              endDate: ad.endDate,
              price: ad.price,
            }
          : null,
      }
    : null;

  return {
    _id: transaction._id,
    id: transaction._id,
    transactionId: transaction.transactionId,
    invoiceNumber: transaction.transactionId,
    invoiceUrl,
    invoiceDownloadUrl,
    amount: transaction.amount,
    fee: transaction.fee || 0,
    currency: transaction.currency || "USD",
    paymentMethod: transaction.paymentMethod,
    paymentStatus: transaction.paymentStatus,
    transactionType: transaction.transactionType,
    category,
    paymentType,
    title,
    subtitle,
    description: transaction.description || "",
    icon,
    displayColor,
    user: transaction.userId,
    store: store
      ? {
          id: store._id,
          displayName: store.displayName,
          logo: store.logo,
        }
      : null,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    actions: {
      canView: true,
      canDownloadInvoice: Boolean(invoiceUrl || invoiceDownloadUrl),
      canRefund: transaction.paymentStatus === PAYMENT_STATUS.PAID,
    },
    subscription: subscriptionPayload,
    postAdd: postAddPayload,
    advertisement: postAddPayload,
    metadata: transaction.metadata || {},
  };
};

/**
 * Admin: Get all transactions (Subscriptions, Advertisements, Post Ads)
 */
const getAllSubscriptionTransactions = async (queryOptions: {
  searchTerm?: string;
  status?: string;
  type?: string;
  page?: number | string;
  limit?: number | string;
}): Promise<any> => {
  const matchQuery: any = {
    isDeleted: { $ne: true },
  };

  // 1. Status Filter
  if (
    queryOptions.status &&
    queryOptions.status !== "all" &&
    queryOptions.status !== "All statuses"
  ) {
    const normalizedStatus = queryOptions.status.toUpperCase();
    matchQuery.paymentStatus = normalizedStatus;
  }

  // 2. Type Filter (subscription, advertisement / post_add, refund, all)
  if (queryOptions.type && queryOptions.type !== "all") {
    const t = queryOptions.type.toLowerCase();
    if (t === "subscription" || t === "subscriptions") {
      matchQuery.transactionType = {
        $in: [
          TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT,
          TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
        ],
      };
    } else if (
      t === "advertisement" ||
      t === "advertisements" ||
      t === "post_add" ||
      t === "post-add"
    ) {
      matchQuery.transactionType = TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT;
    } else if (t === "refund") {
      matchQuery.transactionType = TRANSACTION_TYPE.REFUND;
    }
  }

  // 3. Search logic (Store name, plan name, city name, invoice/transactionId)
  if (queryOptions.searchTerm) {
    const searchRegex = new RegExp(queryOptions.searchTerm, "i");

    const [matchingStores, matchingPackages, matchingCities] =
      await Promise.all([
        Store.find({ displayName: { $regex: searchRegex } })
          .select("owner")
          .lean(),
        SubscriptionPackage.find({ name: { $regex: searchRegex } })
          .select("_id")
          .lean(),
        CityAdConfiguration.find({
          $or: [
            { city: { $regex: searchRegex } },
            { province: { $regex: searchRegex } },
          ],
        })
          .select("_id")
          .lean(),
      ]);

    const ownerIds = matchingStores.map((store: any) => store.owner);
    const packageIds = matchingPackages.map((pkg: any) => pkg._id);
    const cityIds = matchingCities.map((c: any) => c._id.toString());

    matchQuery.$or = [
      { transactionId: { $regex: searchRegex } },
      { userId: { $in: ownerIds } },
      { packageId: { $in: packageIds } },
      { "metadata.cityName": { $regex: searchRegex } },
      { "metadata.cityConfigId": { $in: cityIds } },
    ];
  }

  // 4. Pagination & Sorting setup
  const page = Math.max(1, Number(queryOptions.page) || 1);
  const limit = Math.max(1, Number(queryOptions.limit) || 10);
  const skip = (page - 1) * limit;

  // Execute count and paginated find in parallel
  const [total, transactions] = await Promise.all([
    Transaction.countDocuments(matchQuery),
    Transaction.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email timezone")
      .populate("packageId", "name price duration packageType")
      .lean(),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Batch fetch all stores for the users on this page in ONE query
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

  const data = transactions.map((tx: any) => {
    const userIdStr = tx.userId?._id?.toString() || tx.userId?.toString() || "";
    const store = storeMap.get(userIdStr);

    let method = "Datafast";
    if (tx.metadata?.paymentBrand || tx.metadata?.cardType) {
      method = `Datafast (${tx.metadata.paymentBrand || tx.metadata.cardType})`;
    }

    const txTimezone = tx.userId?.timezone || "Asia/Dhaka";
    const dateStr = tx.createdAt
      ? DateTime.fromJSDate(new Date(tx.createdAt))
          .setZone(txTimezone)
          .toFormat("LLL d, yyyy")
      : "";

    let status = "Pending";
    if (tx.paymentStatus === PAYMENT_STATUS.PAID) {
      status = "Paid";
    } else if (tx.paymentStatus === PAYMENT_STATUS.FAILED) {
      status = "Failed";
    } else if (tx.paymentStatus === PAYMENT_STATUS.REFUNDED) {
      status = "Refunded";
    }

    const isPostAdd =
      tx.transactionType === TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT ||
      tx.metadata?.bookingType === "advertisement";
    const isSubscription =
      tx.transactionType === TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT ||
      tx.transactionType === TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL ||
      Boolean(tx.packageId);

    let planName = tx.packageId?.name || "N/A";
    let category = "other";
    if (isPostAdd) {
      category = "post_add";
      const pos = tx.metadata?.position || 1;
      const city = tx.metadata?.cityName || "";
      planName = `Anuncio (Pos. #${pos}${city ? ` - ${city}` : ""})`;
    } else if (isSubscription) {
      category = "subscription";
      planName = tx.packageId?.name || "Suscripción de Tienda";
    } else if (tx.transactionType === TRANSACTION_TYPE.REFUND) {
      category = "refund";
      planName = "Reembolso";
    }

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
      store: store ? store.displayName || "N/A" : tx.userId?.name || "N/A",
      plan: planName,
      category,
      transactionType: tx.transactionType,
      method,
      amount: tx.amount,
      date: dateStr,
      status,
      canRefund: tx.paymentStatus === PAYMENT_STATUS.PAID,
      metadata: tx.metadata || {},
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

/**
 * Refund a paid transaction via Datafast gateway
 */
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
    await datafastService.refundPayment(gatewayTxId, transaction.amount);

    // Update transaction
    transaction.paymentStatus = PAYMENT_STATUS.REFUNDED;
    await transaction.save();

    // Cancel corresponding Subscription if applicable
    const subscription = await Subscription.findOne({
      $or: [
        { trxId: gatewayTxId },
        { checkoutSessionId: transaction.checkoutSessionId },
      ],
    });

    if (subscription) {
      subscription.status = "canceled";
      await subscription.save();

      // Update user subscription status
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
  getMyTransactionsFromDB,
  getSingleTransactionFromDB,
  getAllSubscriptionTransactions,
  refundTransactionFromDB,
  // Backward compatibility aliases
  getTransactions: getMyTransactionsFromDB,
  getTransactionsByUser: (userId: string, role?: string, filter?: string) =>
    getMyTransactionsFromDB(userId, role || "user", { filter }),
};
