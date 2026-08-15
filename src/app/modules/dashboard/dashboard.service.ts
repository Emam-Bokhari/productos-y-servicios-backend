import { User } from "../user/user.model";
import { Store } from "../store/store.model";
import { Subscription } from "../subscription/subscription.model";
import { USER_ROLES } from "../../../enums/user";

const getDashboardOverview = async (queryYear?: string) => {
  // 1. Total Users (excluding admins and super_admins)
  const totalUsers = await User.countDocuments({
    role: { $in: [USER_ROLES.USER, USER_ROLES.SELLER] },
  });

  // 2. Total Stores
  const totalStores = await Store.countDocuments({});

  // 3. Active Subscriptions
  const activeSubscriptionsCount = await Subscription.countDocuments({
    status: "active",
  });

  // 4. MRR (Monthly Recurring Revenue)
  // Fetch active store creation subscriptions and populate their packages to get duration and price
  const activeStoreSubscriptions = await Subscription.find({
    status: "active",
    packageType: "store_creation",
  }).populate("packageId");

  let totalMRR = 0;
  for (const sub of activeStoreSubscriptions) {
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
  // Round to 2 decimal places
  totalMRR = Math.round(totalMRR * 100) / 100;

  // 5. Store Types split (Product vs Service)
  const productStoresCount = await Store.countDocuments({ storeType: "product_store" });
  const serviceStoresCount = await Store.countDocuments({ storeType: "service_store" });
  const totalTypedStores = productStoresCount + serviceStoresCount;

  let productPercentage = 0;
  let servicePercentage = 0;
  if (totalTypedStores > 0) {
    productPercentage = Math.round((productStoresCount / totalTypedStores) * 100);
    servicePercentage = Math.round((serviceStoresCount / totalTypedStores) * 100);
  }

  // 6. Subscription Revenue over the 12 calendar months of the selected/current year
  const currentYear = new Date().getFullYear();
  let filterYear = currentYear;
  if (queryYear) {
    const parsedYear = parseInt(queryYear, 10);
    if (!isNaN(parsedYear)) {
      filterYear = parsedYear;
    }
  }

  const months = [
    { name: "Jan", index: 0 },
    { name: "Feb", index: 1 },
    { name: "Mar", index: 2 },
    { name: "Apr", index: 3 },
    { name: "May", index: 4 },
    { name: "Jun", index: 5 },
    { name: "Jul", index: 6 },
    { name: "Aug", index: 7 },
    { name: "Sep", index: 8 },
    { name: "Oct", index: 9 },
    { name: "Nov", index: 10 },
    { name: "Dec", index: 11 },
  ];

  const revenueChartData = [];
  for (const m of months) {
    const startOfMonth = new Date(filterYear, m.index, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(filterYear, m.index + 1, 0, 23, 59, 59, 999);

    const subscriptions = await Subscription.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      amountPaid: { $gt: 0 },
    } as any);

    const monthlyRevenue = subscriptions.reduce(
      (sum, sub) => sum + (sub.amountPaid || 0),
      0
    );

    revenueChartData.push({
      month: m.name,
      revenue: Math.round(monthlyRevenue * 100) / 100,
    });
  }

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
