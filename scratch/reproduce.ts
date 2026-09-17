import axios from "axios";
import config from "../src/config";
import datafastService from "../src/app/modules/datafast/datafast.service";
import mongoose from "mongoose";
import { User } from "../src/app/modules/user/user.model";
import { SubscriptionPackage } from "../src/app/modules/subscriptionPackage/subscriptionPackage.model";

async function reproduce() {
  await mongoose.connect(config.database_url as string);
  const pkg = await SubscriptionPackage.findById("6a86804e8ecf4b4417488532");
  console.log("Package:", pkg?.name, "price:", pkg?.price, "type:", pkg?.packageType);

  const res = await datafastService.prepareCheckoutSession({
    amount: pkg!.price,
    currency: "USD",
    userEmail: "studentemam@gmail.com",
    userName: "Moshfiqur Rahman",
    isSubscription: pkg!.packageType === "store_creation",
    merchantTransactionId: `INV-2026-${Date.now()}`,
    metadata: {
      userId: "6a76edddda03657909bcbd43",
      packageId: pkg!._id.toString(),
      packageType: pkg!.packageType,
    },
  });

  console.log("Checkout created ID:", res.checkoutId);
  const statusBefore = await datafastService.getPaymentStatus(res.checkoutId);
  console.log("Status immediately after creation:", statusBefore.result);

  await mongoose.disconnect();
}
reproduce();
