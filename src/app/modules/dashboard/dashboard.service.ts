import { User } from "../user/user.model";
import { Store } from "../store/store.model";
import { Subscription } from "../subscription/subscription.model";
import { SubscriptionPackage } from "../subscriptionPackage/subscriptionPackage.model";
import { USER_ROLES } from "../../../enums/user";

const getDashboardOverview = async (queryYear?: string) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  let filterYear = currentYear;
  if (queryYear) {
    const parsedYear = parseInt(queryYear, 10);
    if (!isNaN(parsedYear)) {
      filterYear = parsedYear;
    }
  }

  const startOfYear = new Date(filterYear, 0, 1, 0, 0, 0, 0);
  const endOfYear = new Date(filterYear, 11, 31, 23, 59, 59, 999);

  // Execute all metric queries concurrently in parallel
  const [
    totalUsers,
    totalStores,
    activeSubscriptionsCount,
    activeSubscriptions,
    storeTypeCounts,
    monthlyRevenueAgg,
  ] = await Promise.all([
    // 1. Total Users (excluding admins and super_admins)
    User.countDocuments({
      role: { $in: [USER_ROLES.USER, USER_ROLES.SELLER] },
    }),

    // 2. Total Stores
    Store.countDocuments({}),

    // 3. Active Subscriptions Count
    Subscription.countDocuments({
      status: "active",
      expiresAt: { $gt: now },
    }),

    // 4. Active Subscriptions for MRR calculation (lean with only required fields)
    Subscription.find({
      status: "active",
      expiresAt: { $gt: now },
    })
      .select("packageId")
      .populate({
        path: "packageId",
        model: SubscriptionPackage,
        select: "price duration",
      })
      .lean(),

    // 5. Store Types Count Split
    Store.aggregate([
      {
        $group: {
          _id: "$storeType",
          count: { $sum: 1 },
        },
      },
    ]),

    // 6. Subscription Revenue for the selected year grouped by month
    Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear, $lte: endOfYear },
          amountPaid: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalRevenue: { $sum: "$amountPaid" },
        },
      },
    ]),
  ]);

  // Calculate MRR
  let totalMRR = 0;
  for (const sub of activeSubscriptions) {
    const pkg = sub.packageId as any;
    if (pkg && typeof pkg.price === "number") {
      const price = pkg.price;
      const duration = pkg.duration;

      if (duration === "one_month") {
        totalMRR += price;
      } else if (duration === "three_month") {
        totalMRR += price / 3;
      } else if (duration === "six_month") {
        totalMRR += price / 6;
      } else if (duration === "one_year") {
        totalMRR += price / 12;
      } else if (duration === "seven_days") {
        totalMRR += (price / 7) * 30;
      } else {
        totalMRR += price;
      }
    }
  }
  totalMRR = Math.round(totalMRR * 100) / 100;

  // Process Store Types split
  let productStoresCount = 0;
  let serviceStoresCount = 0;
  for (const item of storeTypeCounts) {
    if (item._id === "product_store") {
      productStoresCount = item.count;
    } else if (item._id === "service_store") {
      serviceStoresCount = item.count;
    }
  }
  const totalTypedStores = productStoresCount + serviceStoresCount;

  let productPercentage = 0;
  let servicePercentage = 0;
  if (totalTypedStores > 0) {
    productPercentage = Math.round(
      (productStoresCount / totalTypedStores) * 100,
    );
    servicePercentage = Math.round(
      (serviceStoresCount / totalTypedStores) * 100,
    );
  }

  // Build 12 calendar months revenue chart data
  const months = [
    { name: "Jan", index: 0, monthNum: 1 },
    { name: "Feb", index: 1, monthNum: 2 },
    { name: "Mar", index: 2, monthNum: 3 },
    { name: "Apr", index: 3, monthNum: 4 },
    { name: "May", index: 4, monthNum: 5 },
    { name: "Jun", index: 5, monthNum: 6 },
    { name: "Jul", index: 6, monthNum: 7 },
    { name: "Aug", index: 7, monthNum: 8 },
    { name: "Sep", index: 8, monthNum: 9 },
    { name: "Oct", index: 9, monthNum: 10 },
    { name: "Nov", index: 10, monthNum: 11 },
    { name: "Dec", index: 11, monthNum: 12 },
  ];

  const revenueByMonth = new Map<number, number>();
  for (const item of monthlyRevenueAgg) {
    revenueByMonth.set(item._id, item.totalRevenue);
  }

  const revenueChartData = months.map((m) => ({
    month: m.name,
    revenue: Math.round((revenueByMonth.get(m.monthNum) || 0) * 100) / 100,
  }));

  return {
    cards: {
      totalUsers,
      totalStores,
      activeSubscriptions: activeSubscriptionsCount,
      mrr: totalMRR,
    },
    storeTypesSplit: {
      productStoresCount,
      serviceStoresCount,
      productPercentage,
      servicePercentage,
    },
    revenueChart: revenueChartData,
  };
};

export const DashboardService = {
  getDashboardOverview,
};

