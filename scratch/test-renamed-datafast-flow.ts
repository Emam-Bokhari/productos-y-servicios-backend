import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcrypt";
import { jwtHelper } from "../src/helpers/jwtHelper";
import config from "../src/config";
import { Secret } from "jsonwebtoken";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const BASE_URL = "http://10.10.7.10:5009";

const run = async () => {
  await mongoose.connect(process.env.DATABASE_URL as string);
  const db = mongoose.connection.db;
  if (!db) throw new Error("No db handle");

  console.log("=== 1. Ensuring Password / Generating Token for Merchant ===");
  const rawPassword = "Password123!";
  const salt = await bcrypt.genSalt(12);
  const hashed = await bcrypt.hash(rawPassword, salt);
  await db.collection("users").updateOne(
    { email: "datafast.merchant.2026@gmail.com" },
    { $set: { password: hashed } }
  );

  // Login via API to test auth flow
  const loginRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
    email: "datafast.merchant.2026@gmail.com",
    password: rawPassword,
  });

  const token = loginRes.data.data.token || loginRes.data.data.accessToken;
  console.log("Authenticated successfully via POST /auth/login. Token acquired.");

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  console.log("\n=== 2. Checking User Profile ===");
  const profileRes = await axios.get(`${BASE_URL}/api/v1/users/profile`, {
    headers: authHeaders,
  });
  const user = profileRes.data.data;
  console.log("User activeRole:", user.activeRole);
  console.log("User subscriptionStatus:", user.subscriptionStatus);
  console.log("User datafastRegistrationToken:", user.datafastRegistrationToken);

  console.log("\n=== 3. Querying Subscription Packages ===");
  const pkgRes = await axios.get(`${BASE_URL}/api/v1/subscription-packages`, {
    headers: authHeaders,
  });
  const storePackage = pkgRes.data.data.find(
    (p: any) => p.packageType === "store_creation" && p.status === "active"
  );
  console.log(`Found store package: ${storePackage.name} ($${storePackage.price}) ID: ${storePackage._id}`);

  console.log("\n=== 4. Initiating Datafast Checkout for Store Subscription ===");
  const initRes = await axios.post(
    `${BASE_URL}/api/v1/datafast/create-checkout-session`,
    { packageId: storePackage._id },
    { headers: authHeaders }
  );

  const checkoutId = initRes.data.data.checkoutId;
  const paymentUrl = initRes.data.data.paymentUrl;
  console.log("Checkout created! checkoutId:", checkoutId);
  console.log("paymentUrl:", paymentUrl);

  console.log("\n=== 5. Fulfilling Payment via Datafast Callback ===");
  const callbackRes = await axios.get(
    `${BASE_URL}/api/v1/datafast/callback?checkoutId=${checkoutId}`
  );
  console.log("Callback processed! Response status:", callbackRes.status);

  console.log("\n=== 6. Checking Database for newly created Transaction ===");
  const latestTx = await db.collection("transactions").findOne({
    checkoutSessionId: checkoutId,
  });

  console.log("Newly created transaction in MongoDB:");
  console.log({
    _id: latestTx?._id,
    transactionId: latestTx?.transactionId,
    paymentStatus: latestTx?.paymentStatus,
    amount: latestTx?.amount,
    customerId: latestTx?.customerId,
    checkoutSessionId: latestTx?.checkoutSessionId,
    gatewayTransactionId: latestTx?.gatewayTransactionId,
    invoiceUrl: latestTx?.invoiceUrl,
    stripeCustomerId: (latestTx as any)?.stripeCustomerId,
    stripeCheckoutSessionId: (latestTx as any)?.stripeCheckoutSessionId,
    stripePaymentIntentId: (latestTx as any)?.stripePaymentIntentId,
  });

  if (
    latestTx?.checkoutSessionId === checkoutId &&
    latestTx?.paymentStatus === "PAID" &&
    latestTx?.customerId &&
    latestTx?.gatewayTransactionId &&
    (latestTx as any).stripeCheckoutSessionId === undefined &&
    (latestTx as any).stripeCustomerId === undefined &&
    (latestTx as any).stripePaymentIntentId === undefined
  ) {
    console.log("\nSUCCESS: All fields are correctly named and no stripe fields exist!");
  } else {
    console.error("\nFAILURE: Transaction fields did not match expected structure!");
    process.exit(1);
  }

  console.log("\n=== 7. Checking Subscription Record in Database ===");
  const subRecord = await db.collection("subscriptions").findOne({
    checkoutSessionId: checkoutId,
  });
  console.log("Subscription record:", {
    _id: subRecord?._id,
    packageType: subRecord?.packageType,
    status: subRecord?.status,
    checkoutSessionId: subRecord?.checkoutSessionId,
    datafastRegistrationToken: subRecord?.datafastRegistrationToken,
    stripeSessionId: (subRecord as any)?.stripeSessionId,
    stripeSubscriptionId: (subRecord as any)?.stripeSubscriptionId,
  });

  if (
    subRecord?.checkoutSessionId === checkoutId &&
    subRecord?.status === "active" &&
    (subRecord as any).stripeSessionId === undefined &&
    (subRecord as any).stripeSubscriptionId === undefined
  ) {
    console.log("\nSUCCESS: Subscription record is also correctly named and free of Stripe fields!");
  } else {
    console.error("\nFAILURE: Subscription fields did not match expected structure!");
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("\nALL VERIFICATIONS PASSED 100%!");
};

run().catch((err) => {
  console.error("Test failed:", err.response?.data || err.message);
  process.exit(1);
});
