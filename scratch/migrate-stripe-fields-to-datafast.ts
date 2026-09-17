import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const runMigration = async () => {
  const dbUri = process.env.DATABASE_URL as string;
  if (!dbUri) {
    throw new Error("DATABASE_URL is not defined in .env");
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(dbUri);
  console.log("Connected to MongoDB successfully.");

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Could not acquire db handle from mongoose");
  }

  console.log("--- 1. Migrating Transactions Collection ---");
  // A. For transactions having stripeCheckoutSessionId, rename to checkoutSessionId
  const txSessionResult = await db.collection("transactions").updateMany(
    { stripeCheckoutSessionId: { $exists: true } },
    { $rename: { stripeCheckoutSessionId: "checkoutSessionId" } }
  );
  console.log(`Renamed stripeCheckoutSessionId -> checkoutSessionId on ${txSessionResult.modifiedCount} transactions.`);

  // B. For transactions having stripeCustomerId, rename to customerId
  const txCustomerResult = await db.collection("transactions").updateMany(
    { stripeCustomerId: { $exists: true } },
    { $rename: { stripeCustomerId: "customerId" } }
  );
  console.log(`Renamed stripeCustomerId -> customerId on ${txCustomerResult.modifiedCount} transactions.`);

  // C. For transactions having stripePaymentIntentId, copy to gatewayTransactionId if empty
  const txCursor = db.collection("transactions").find({ stripePaymentIntentId: { $exists: true } });
  let txCopied = 0;
  while (await txCursor.hasNext()) {
    const doc = await txCursor.next();
    if (doc && !doc.gatewayTransactionId) {
      await db.collection("transactions").updateOne(
        { _id: doc._id },
        { $set: { gatewayTransactionId: doc.stripePaymentIntentId } }
      );
      txCopied++;
    }
  }
  console.log(`Copied stripePaymentIntentId to gatewayTransactionId on ${txCopied} transactions.`);

  // D. Unset dead stripe fields in transactions
  const txUnsetResult = await db.collection("transactions").updateMany(
    {},
    {
      $unset: {
        stripePaymentIntentId: "",
        stripeChargeId: "",
        stripeTransferId: "",
        stripePayoutId: "",
        stripeRefundId: "",
      },
    }
  );
  console.log(`Unset old stripe fields on ${txUnsetResult.modifiedCount} transactions.`);

  console.log("--- 2. Migrating Subscriptions Collection ---");
  // A. Rename stripeSessionId -> checkoutSessionId
  const subSessionResult = await db.collection("subscriptions").updateMany(
    { stripeSessionId: { $exists: true } },
    { $rename: { stripeSessionId: "checkoutSessionId" } }
  );
  console.log(`Renamed stripeSessionId -> checkoutSessionId on ${subSessionResult.modifiedCount} subscriptions.`);

  // B. Unset stripeSubscriptionId
  const subUnsetResult = await db.collection("subscriptions").updateMany(
    {},
    { $unset: { stripeSubscriptionId: "" } }
  );
  console.log(`Unset stripeSubscriptionId on ${subUnsetResult.modifiedCount} subscriptions.`);

  console.log("--- 3. Migrating Users Collection ---");
  const userUnsetResult = await db.collection("users").updateMany(
    {},
    {
      $unset: {
        stripeCustomerId: "",
        stripeSubscriptionId: "",
        stripeConnectedAccountId: "",
      },
    }
  );
  console.log(`Unset stripe fields on ${userUnsetResult.modifiedCount} users.`);

  console.log("--- 4. Migrating SubscriptionPackages Collection ---");
  const pkgUnsetResult = await db.collection("subscriptionpackages").updateMany(
    {},
    {
      $unset: {
        stripeProductId: "",
        stripePriceId: "",
      },
    }
  );
  console.log(`Unset stripe fields on ${pkgUnsetResult.modifiedCount} subscription packages.`);

  console.log("\n--- Verification: Checking our test merchant records ---");
  const testUser = await db.collection("users").findOne({ email: "datafast.merchant.2026@gmail.com" });
  console.log("Test User:", {
    _id: testUser?._id,
    email: testUser?.email,
    role: testUser?.role,
    subscriptionStatus: testUser?.subscriptionStatus,
    datafastRegistrationToken: testUser?.datafastRegistrationToken,
    stripeCustomerId: testUser?.stripeCustomerId,
  });

  const testStore = await db.collection("stores").findOne({ owner: testUser?._id });
  console.log("Test Store:", {
    _id: testStore?._id,
    displayName: testStore?.displayName,
  });

  const testSubs = await db.collection("subscriptions").find({ userId: testUser?._id }).toArray();
  console.log(`Test Subscriptions count: ${testSubs.length}`);
  testSubs.forEach((s, idx) => {
    console.log(`Sub #${idx + 1}:`, {
      _id: s._id,
      packageType: s.packageType,
      status: s.status,
      checkoutSessionId: s.checkoutSessionId,
      datafastRegistrationToken: s.datafastRegistrationToken,
      invoiceNumber: s.invoiceNumber,
      stripeSessionId: (s as any).stripeSessionId,
      stripeSubscriptionId: (s as any).stripeSubscriptionId,
    });
  });

  const testTxs = await db.collection("transactions").find({ userId: testUser?._id }).toArray();
  console.log(`Test Transactions count: ${testTxs.length}`);
  testTxs.forEach((t, idx) => {
    console.log(`Tx #${idx + 1}:`, {
      _id: t._id,
      transactionId: t.transactionId,
      amount: t.amount,
      paymentStatus: t.paymentStatus,
      customerId: t.customerId,
      checkoutSessionId: t.checkoutSessionId,
      gatewayTransactionId: t.gatewayTransactionId,
      stripeCustomerId: (t as any).stripeCustomerId,
      stripeCheckoutSessionId: (t as any).stripeCheckoutSessionId,
      stripePaymentIntentId: (t as any).stripePaymentIntentId,
    });
  });

  await mongoose.disconnect();
  console.log("\nMigration completed successfully!");
};

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
