import mongoose from "mongoose";
import config from "../src/config";

async function checkStoresAndUsers() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const stores = await db.collection("stores").find({}).toArray();
  console.log(`Found ${stores.length} stores:`);
  for (const s of stores) {
    const owner = await db.collection("users").findOne({ _id: s.owner });
    console.log(`- Store: "${s.displayName}" (${s.storeType})`);
    console.log(`  City: ${s.city}, Lat: ${s.latitude}, Lng: ${s.longitude}`);
    console.log(
      `  Owner: ${owner?.name} (${owner?.email}), ActiveRole: ${owner?.activeRole}, SubStatus: ${owner?.subscriptionStatus}`,
    );
  }

  await mongoose.disconnect();
}
checkStoresAndUsers();
