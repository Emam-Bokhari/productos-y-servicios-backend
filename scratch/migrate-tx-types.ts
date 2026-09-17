import mongoose from "mongoose";
import config from "../src/config";
import { Transaction } from "../src/app/modules/transaction/transaction.model";
import { TRANSACTION_TYPE } from "../src/app/modules/transaction/transaction.constant";

async function migrateTransactionTypes() {
  await mongoose.connect(config.database_url as string);
  console.log("=== Connected to MongoDB for transactionType Migration ===");

  const db = mongoose.connection.db;
  if (!db) throw new Error("No db connection");

  const txCollection = db.collection("transactions");

  // 1. Update advertisement transactions
  const adResult = await txCollection.updateMany(
    {
      $or: [
        { "metadata.bookingType": "advertisement" },
        { "metadata.cityConfigId": { $exists: true, $ne: "" } },
      ],
    },
    {
      $set: { transactionType: TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT },
    },
  );
  console.log(`Updated advertisement transactions: matched ${adResult.matchedCount}, modified ${adResult.modifiedCount}`);

  // 2. Update remaining booking_payment transactions to subscription_payment
  const subResult = await txCollection.updateMany(
    {
      transactionType: "booking_payment",
    },
    {
      $set: { transactionType: TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT },
    },
  );
  console.log(`Updated subscription transactions: matched ${subResult.matchedCount}, modified ${subResult.modifiedCount}`);

  // 3. Verify counts
  const counts = await txCollection
    .aggregate([{ $group: { _id: "$transactionType", count: { $sum: 1 } } }])
    .toArray();
  console.log("New distinct transactionType counts in DB:", counts);

  await mongoose.disconnect();
  console.log("=== Migration completed successfully! ===");
}

migrateTransactionTypes().catch((e) => {
  console.error("Migration error:", e);
  process.exit(1);
});
