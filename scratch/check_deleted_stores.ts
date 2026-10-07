import mongoose from "mongoose";
import config from "../src/config";

async function checkStores() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const allStores = await db.collection("stores").find({}).toArray();
  console.log(`Total stores in db.collection('stores'): ${allStores.length}`);
  
  // check deleted stores
  const deletedStores = await db.collection("stores").find({ isDeleted: true }).toArray();
  console.log(`Deleted stores: ${deletedStores.length}`);

  // check all sellers
  const allSellers = await db.collection("sellers").find({}).toArray();
  console.log(`Total sellers in db.collection('sellers'): ${allSellers.length}`);

  const deletedSellers = await db.collection("sellers").find({ isDeleted: true }).toArray();
  console.log(`Deleted sellers: ${deletedSellers.length}`);

  await mongoose.disconnect();
}

checkStores().catch(console.error);
