import mongoose from "mongoose";
import config from "../src/config";
import datafastService from "../src/app/modules/datafast/datafast.service";
import { SubscriptionPackage } from "../src/app/modules/subscriptionPackage/subscriptionPackage.model";
import { User } from "../src/app/modules/user/user.model";
import { Transaction } from "../src/app/modules/transaction/transaction.model";

async function createCheckout() {
  await mongoose.connect(config.database_url as string);
  console.log("Connected to DB");

  const pkgId = "6a7ff377c24d0046a564c737";
  const userId = "6a76edddda03657909bcbd43";

  const pkg = await SubscriptionPackage.findById(pkgId);
  const user = await User.findById(userId);

  if (!pkg || !user) {
    console.error("Missing pkg or user");
    return;
  }

  const count = await Transaction.countDocuments({
    transactionId: { $regex: "^INV-" },
  });
  const invoiceNumber = 1000 + count + 1;
  const merchantTxId = `INV-${new Date().getFullYear()}-${invoiceNumber}`;

  const checkoutResult = await datafastService.prepareCheckoutSession({
    amount: pkg.price,
    currency: "USD",
    userEmail: user.email,
    userName: user.name,
    isSubscription: pkg.packageType === "store_creation",
    merchantTransactionId: merchantTxId,
    metadata: {
      userId: user._id.toString(),
      packageId: pkg._id.toString(),
      packageType: pkg.packageType,
    },
  });

  console.log("Checkout Result:", checkoutResult);
  console.log("CHECKOUT_ID=" + checkoutResult.checkoutId);
  const checkoutUrl = `http://10.10.7.10:5009/api/v1/datafast/pay/${checkoutResult.checkoutId}`;
  console.log("CHECKOUT_URL=" + checkoutUrl);

  await mongoose.disconnect();
}

createCheckout();
