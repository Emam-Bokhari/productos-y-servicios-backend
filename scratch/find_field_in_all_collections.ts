import mongoose from "mongoose";
import config from "../src/config";

async function findField() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();

  console.log("Searching for field 'hasSellerAccount' across all collections...");
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments({ hasSellerAccount: { $exists: true } });
    if (count > 0) {
      console.log(`Found in collection "${col.name}": ${count} documents!`);
      const docs = await db.collection(col.name).find({ hasSellerAccount: { $exists: true } }).limit(5).toArray();
      console.log(docs);
    }
  }
  console.log("Done searching.");
  await mongoose.disconnect();
}

findField().catch(console.error);
