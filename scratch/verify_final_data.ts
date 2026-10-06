import mongoose from "mongoose";
import config from "../src/config";

async function verifyFinalData() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const collections = [
    "users",
    "stores",
    "sellers",
    "products",
    "services",
    "advertisements",
    "subscriptions",
    "transactions",
    "reviews",
    "favorites",
    "storetraffics",
    "chats",
    "messages",
    "notifications",
  ];

  console.log("\n=== FINAL COLLECTION DOCUMENT COUNTS ===");
  for (const c of collections) {
    const count = await db.collection(c).countDocuments();
    console.log(`${c.padEnd(20)}: ${count}`);
  }

  console.log("\n=== SAMPLE STORE WITH POPULATED FIELDS ===");
  const sampleStore = await db.collection("stores").findOne({});
  console.log(JSON.stringify(sampleStore, null, 2));

  console.log("\n=== SAMPLE PRODUCT ===");
  const sampleProd = await db.collection("products").findOne({});
  console.log(JSON.stringify(sampleProd, null, 2));

  console.log("\n=== SAMPLE SERVICE ===");
  const sampleServ = await db.collection("services").findOne({});
  console.log(JSON.stringify(sampleServ, null, 2));

  console.log("\n=== SAMPLE ADVERTISEMENT ===");
  const sampleAd = await db.collection("advertisements").findOne({});
  console.log(JSON.stringify(sampleAd, null, 2));

  console.log("\n=== SAMPLE SUBSCRIPTION ===");
  const sampleSub = await db.collection("subscriptions").findOne({});
  console.log(JSON.stringify(sampleSub, null, 2));

  console.log("\n=== SAMPLE TRANSACTION ===");
  const sampleTx = await db.collection("transactions").findOne({});
  console.log(JSON.stringify(sampleTx, null, 2));

  await mongoose.disconnect();
}
verifyFinalData();
