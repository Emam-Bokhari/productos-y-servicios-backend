import mongoose from "mongoose";
import config from "../src/config";

async function checkSamples() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  console.log("--- SAMPLE STORE ---");
  console.log(JSON.stringify(await db.collection("stores").findOne({}), null, 2));

  console.log("--- SAMPLE PRODUCT ---");
  console.log(JSON.stringify(await db.collection("products").findOne({}), null, 2));

  console.log("--- SAMPLE SERVICE ---");
  console.log(JSON.stringify(await db.collection("services").findOne({}), null, 2));

  console.log("--- SAMPLE SUBSCRIPTION ---");
  console.log(JSON.stringify(await db.collection("subscriptions").findOne({}), null, 2));

  console.log("--- SAMPLE ADVERTISEMENT ---");
  console.log(JSON.stringify(await db.collection("advertisements").findOne({}), null, 2));

  console.log("--- SAMPLE TRANSACTION ---");
  console.log(JSON.stringify(await db.collection("transactions").findOne({}), null, 2));

  console.log("--- SAMPLE SELLER ---");
  console.log(JSON.stringify(await db.collection("sellers").findOne({}), null, 2));

  await mongoose.disconnect();
}
checkSamples();
