import { ClientSession, Types } from "mongoose";
import { ITransaction } from "./transaction.interface";
import { Transaction } from "./transaction.model";
import { TRANSACTION_TYPE, PAYMENT_STATUS } from "./transaction.constant";
import { User } from "../user/user.model";
import { getDayRangeInTimezone } from "../../../shared/timezoneHelper";
import { DateTime } from "luxon";

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

  // Build the base query for User/Seller role
  const query: any = {
    paymentStatus: { $in: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED] },
  };

  if (userRole === "seller") {
    query.$or = [{ userId: userObjectId }, { driverId: userObjectId }];
  } else {
    // Default to "user" logic where transactions belong directly to the user
    query.userId = userObjectId;
  }

  // Handle case-insensitive and variant filter values
  let normalizedFilter = "all";
  if (filter) {
    const f = filter.toLowerCase();
    if (
      f === "add_money" ||
      f === "add-money" ||
      f === "addmoney" ||
      f === "add" ||
      f === "add money"
    ) {
      normalizedFilter = "add_money";
    } else if (f === "spend") {
      normalizedFilter = "spend";
    }
  }

  if (userRole === "seller") {
    if (normalizedFilter === "add_money") {
      query.transactionType = {
        $in: [
          TRANSACTION_TYPE.BOOKING_PAYMENT,
          TRANSACTION_TYPE.CANCELLATION_COMPENSATION,
          TRANSACTION_TYPE.DRIVER_APPRECIATION,
          TRANSACTION_TYPE.WALLET_TOPUP,
          TRANSACTION_TYPE.REFUND,
          TRANSACTION_TYPE.LOST_FOUND_DELIVERY,
          TRANSACTION_TYPE.DRIVER_REFERRAL_REWARD,
          TRANSACTION_TYPE.USER_REFERRAL_REWARD,
        ],
      };
    } else if (normalizedFilter === "spend") {
      query.transactionType = {
        $in: [TRANSACTION_TYPE.PAYOUT],
      };
    } else {
      // "all"
      query.transactionType = {
        $in: [
          TRANSACTION_TYPE.BOOKING_PAYMENT,
          TRANSACTION_TYPE.CANCELLATION_COMPENSATION,
          TRANSACTION_TYPE.DRIVER_APPRECIATION,
          TRANSACTION_TYPE.WALLET_TOPUP,
          TRANSACTION_TYPE.REFUND,
          TRANSACTION_TYPE.PAYOUT,
          TRANSACTION_TYPE.LOST_FOUND_DELIVERY,
          TRANSACTION_TYPE.DRIVER_REFERRAL_REWARD,
          TRANSACTION_TYPE.USER_REFERRAL_REWARD,
        ],
      };
    }
  } else {
    // Default to "user" logic
    if (normalizedFilter === "add_money") {
      query.transactionType = {
        $in: [
          TRANSACTION_TYPE.WALLET_TOPUP,
          TRANSACTION_TYPE.USER_REFERRAL_REWARD,
        ],
      };
    } else if (normalizedFilter === "spend") {
      query.transactionType = {
        $in: [
          TRANSACTION_TYPE.BOOKING_PAYMENT,
          TRANSACTION_TYPE.CANCELLATION_FEE,
          TRANSACTION_TYPE.DRIVER_APPRECIATION,
          TRANSACTION_TYPE.LOST_FOUND_DELIVERY,
        ],
      };
    } else {
      // "all"
      query.transactionType = {
        $in: [
          TRANSACTION_TYPE.WALLET_TOPUP,
          TRANSACTION_TYPE.BOOKING_PAYMENT,
          TRANSACTION_TYPE.CANCELLATION_FEE,
          TRANSACTION_TYPE.DRIVER_APPRECIATION,
          TRANSACTION_TYPE.LOST_FOUND_DELIVERY,
          TRANSACTION_TYPE.USER_REFERRAL_REWARD,
        ],
      };
    }
  }

  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .populate("userId bookingId rideId");

  return transactions.map((tx) => {
    const txObj = tx.toObject();
    let flowType = "spend"; // default fallback

    const txType = txObj.transactionType;

    if (
      txType === TRANSACTION_TYPE.WALLET_TOPUP ||
      txType === TRANSACTION_TYPE.REFUND ||
      txType === TRANSACTION_TYPE.CANCELLATION_COMPENSATION ||
      txType === TRANSACTION_TYPE.USER_REFERRAL_REWARD ||
      txType === TRANSACTION_TYPE.DRIVER_REFERRAL_REWARD
    ) {
      flowType = "add_money";
    } else if (txType === TRANSACTION_TYPE.PAYOUT) {
      flowType = "spend";
    } else if (
      txType === TRANSACTION_TYPE.BOOKING_PAYMENT ||
      txType === TRANSACTION_TYPE.DRIVER_APPRECIATION ||
      txType === TRANSACTION_TYPE.CANCELLATION_FEE ||
      txType === TRANSACTION_TYPE.LOST_FOUND_DELIVERY
    ) {
      if (userRole === "seller") {
        flowType = "add_money";
      } else {
        flowType = "spend";
      }
    }

    return {
      ...txObj,
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

  // 1. Role-based matching logic
  if (role === "seller") {
    matchQuery.$or = [{ userId: userObjectId }, { driverId: userObjectId }];
  } else {
    // Default to user/passenger
    matchQuery.userId = userObjectId;
  }

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

  if (role === "seller") {
    if (filter === "ride_payment") {
      matchQuery.transactionType = TRANSACTION_TYPE.BOOKING_PAYMENT;
    } else if (filter === "withdrawal") {
      matchQuery.transactionType = TRANSACTION_TYPE.PAYOUT;
    } else if (filter === "refund") {
      matchQuery.transactionType = TRANSACTION_TYPE.REFUND;
    } else if (filter === "bonus") {
      matchQuery.transactionType = TRANSACTION_TYPE.DRIVER_APPRECIATION;
    } else if (filter === "adjustment") {
      matchQuery.transactionType = TRANSACTION_TYPE.CANCELLATION_COMPENSATION;
    } else if (filter === "lost_found" || filter === "lost_found_delivery") {
      matchQuery.transactionType = TRANSACTION_TYPE.LOST_FOUND_DELIVERY;
    } else {
      // 'all'
      matchQuery.transactionType = {
        $in: [
          TRANSACTION_TYPE.BOOKING_PAYMENT,
          TRANSACTION_TYPE.CANCELLATION_COMPENSATION,
          TRANSACTION_TYPE.DRIVER_APPRECIATION,
          TRANSACTION_TYPE.WALLET_TOPUP,
          TRANSACTION_TYPE.REFUND,
          TRANSACTION_TYPE.PAYOUT,
          TRANSACTION_TYPE.LOST_FOUND_DELIVERY,
        ],
      };
    }
  } else {
    // Passenger (User)
    if (filter === "spend") {
      matchQuery.transactionType = {
        $in: [
          TRANSACTION_TYPE.BOOKING_PAYMENT,
          TRANSACTION_TYPE.CANCELLATION_FEE,
          TRANSACTION_TYPE.DRIVER_APPRECIATION,
          TRANSACTION_TYPE.LOST_FOUND_DELIVERY,
        ],
      };
    } else if (filter === "add_money") {
      matchQuery.transactionType = {
        $in: [TRANSACTION_TYPE.WALLET_TOPUP, TRANSACTION_TYPE.REFUND],
      };
    } else {
      // 'all'
      matchQuery.transactionType = {
        $in: [
          TRANSACTION_TYPE.WALLET_TOPUP,
          TRANSACTION_TYPE.BOOKING_PAYMENT,
          TRANSACTION_TYPE.CANCELLATION_FEE,
          TRANSACTION_TYPE.DRIVER_APPRECIATION,
          TRANSACTION_TYPE.LOST_FOUND_DELIVERY,
        ],
      };
    }
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
      const searchObjectId = new Types.ObjectId(queryOptions.search);
      orConditions.push(
        { _id: searchObjectId },
        { rideId: searchObjectId },
        { bookingId: searchObjectId },
      );
    }

    // Search by User/Passenger Name or Driver Name
    const matchingUsers = await User.find({ name: searchRegex }).select("_id");
    const matchingUserIds = matchingUsers.map((u) => u._id);

    if (matchingUserIds.length > 0) {
      orConditions.push(
        { userId: { $in: matchingUserIds } },
        { driverId: { $in: matchingUserIds } },
      );
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

  const total = await Transaction.countDocuments(matchQuery);
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Execute query with nested population
  const transactions = await Transaction.find(matchQuery)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate({
      path: "rideId",
      populate: {
        path: "userId",
        select: "name",
      },
    })
    .populate({
      path: "bookingId",
      populate: {
        path: "userId",
        select: "name",
      },
    });

  // Map transactions to standardized structure
  const data = transactions.map((tx) => {
    const txObj = tx.toObject ? tx.toObject() : tx;
    const ridePopulated = txObj.rideId as any;
    const bookingPopulated = txObj.bookingId as any;
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

    if (role === "seller") {
      let amount = txObj.amount;
      let transactionType = "RIDE_PAYMENT";
      let title = "Ride Payment";
      let icon = "car";
      let displayColor = "green";

      const txType = txObj.transactionType;

      let passengerName = "Passenger";
      if (
        ridePopulated &&
        ridePopulated.userId &&
        typeof ridePopulated.userId === "object"
      ) {
        passengerName = ridePopulated.userId.name || "Passenger";
      } else if (
        bookingPopulated &&
        bookingPopulated.userId &&
        typeof bookingPopulated.userId === "object"
      ) {
        passengerName = bookingPopulated.userId.name || "Passenger";
      }

      if (txType === TRANSACTION_TYPE.BOOKING_PAYMENT) {
        transactionType = "RIDE_PAYMENT";
        title = `Payment from ${passengerName}`;
        icon = "car";
        displayColor = "green";
        amount = txObj.amount;
      } else if (txType === TRANSACTION_TYPE.PAYOUT) {
        transactionType = "WITHDRAWAL";
        title = "Stripe Payout";
        icon = "arrow-up-right";
        displayColor = "red";
        amount = -txObj.amount;
      } else if (txType === TRANSACTION_TYPE.REFUND) {
        transactionType = "REFUND";
        title = `Refund to ${passengerName}`;
        icon = "arrow-down-left";
        displayColor = "green";
        amount = txObj.amount;
      } else if (txType === TRANSACTION_TYPE.DRIVER_APPRECIATION) {
        transactionType = "BONUS";
        title = `Bonus Tip from ${passengerName}`;
        icon = "gift";
        displayColor = "green";
        amount = txObj.amount;
      } else if (txType === TRANSACTION_TYPE.CANCELLATION_COMPENSATION) {
        transactionType = "ADJUSTMENT";
        title = "Cancellation Compensation";
        icon = "shield-alert";
        displayColor = "green";
        amount = txObj.amount;
      } else if (txType === TRANSACTION_TYPE.WALLET_TOPUP) {
        transactionType = "TOPUP";
        title = "Wallet Top-up";
        icon = "plus";
        displayColor = "green";
        amount = txObj.amount;
      } else if (txType === TRANSACTION_TYPE.LOST_FOUND_DELIVERY) {
        transactionType = "LOST_FOUND_DELIVERY";
        title = `Lost & Found Delivery from ${passengerName}`;
        icon = "package";
        displayColor = "green";
        amount = txObj.amount;
      } else {
        transactionType = "RIDE_PAYMENT";
        title = txObj.description || "Ride Payment";
        icon = "car";
        displayColor = "green";
        amount = txObj.amount;
      }

      const rideIdStr = ridePopulated
        ? ridePopulated._id.toString()
        : bookingPopulated
          ? bookingPopulated._id.toString()
          : null;
      const rideCode = rideIdStr
        ? `Ride #${rideIdStr.slice(-6).toUpperCase()}`
        : subtitle;

      return {
        id,
        transactionId,
        type: amount < 0 ? "SPEND" : "ADD_MONEY",
        title,
        subtitle: rideCode,
        amount,
        currency,
        status,
        transactionType,
        icon,
        displayColor,
        createdAt,
        actions: {
          canView: true,
          canDelete: false,
        },
      };
    } else {
      // Passenger mapping
      let amount = txObj.amount;
      let type = "SPEND";
      let title = "Ride Payment";
      let icon = "minus";
      let displayColor = "red";

      const txType = txObj.transactionType;

      if (txType === TRANSACTION_TYPE.WALLET_TOPUP) {
        type = "ADD_MONEY";
        title = "Added to Wallet";
        icon = "plus";
        displayColor = "green";
        amount = txObj.amount;
      } else if (txType === TRANSACTION_TYPE.REFUND) {
        type = "ADD_MONEY";
        title = "Refund Credited";
        icon = "plus";
        displayColor = "green";
        amount = txObj.amount;
      } else if (txType === TRANSACTION_TYPE.CANCELLATION_COMPENSATION) {
        type = "ADD_MONEY";
        title = "Cancellation Compensation";
        icon = "plus";
        displayColor = "green";
        amount = txObj.amount;
      } else if (txType === TRANSACTION_TYPE.LOST_FOUND_DELIVERY) {
        type = "SPEND";
        title = "Lost & Found Delivery";
        icon = "package";
        displayColor = "red";
        amount = -txObj.amount;
      } else if (txType === TRANSACTION_TYPE.BOOKING_PAYMENT) {
        type = "SPEND";
        title = ridePopulated?.destination?.address
          ? `Ride to ${ridePopulated.destination.address}`
          : bookingPopulated?.destination?.address
            ? `Ride to ${bookingPopulated.destination.address}`
            : "Ride Payment";
        icon = "minus";
        displayColor = "red";
        amount = -txObj.amount;
      } else if (txType === TRANSACTION_TYPE.CANCELLATION_FEE) {
        type = "SPEND";
        title = "Cancellation Fee";
        icon = "minus";
        displayColor = "red";
        amount = -txObj.amount;
      } else if (txType === TRANSACTION_TYPE.DRIVER_APPRECIATION) {
        type = "SPEND";
        title = "Driver Tip";
        icon = "minus";
        displayColor = "red";
        amount = -txObj.amount;
      } else if (txType === TRANSACTION_TYPE.PAYOUT) {
        type = "SPEND";
        title = "Withdrawal";
        icon = "minus";
        displayColor = "red";
        amount = -txObj.amount;
      } else {
        type = "SPEND";
        title = txObj.description || "Ride Payment";
        icon = "minus";
        displayColor = "red";
        amount = -txObj.amount;
      }

      return {
        id,
        transactionId,
        type,
        title,
        subtitle,
        status,
        amount,
        currency,
        icon,
        displayColor,
        createdAt,
      };
    }
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

export const TransactionService = {
  createTransaction,
  getTransactionsByUser,
  getTransactions,
};
