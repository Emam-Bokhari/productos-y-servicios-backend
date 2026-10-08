import mongoose from "mongoose";
import config from "../src/config";
import { AuthService } from "../src/app/modules/auth/auth.service";

async function testAllStoreOwners() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const stores = await db.collection("stores").find({}).toArray();
  console.log(`Checking ${stores.length} store owners...`);

  for (const s of stores) {
    const owner = await db.collection("users").findOne({ _id: s.owner });
    if (!owner) {
      console.log(`Store "${s.displayName}" owner ${s.owner} NOT FOUND!`);
      continue;
    }

    const seller = await db.collection("sellers").findOne({ user: owner._id });

    // Test what loginUserFromDB would compute
    const sellerForLogin = await db.collection("sellers").findOne({
      user: owner._id,
      status: "active",
      $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }],
    });

    console.log(`Owner: ${owner.email} (${owner.name})`);
    console.log(`  Store: "${s.displayName}" (${s._id})`);
    console.log(
      `  Seller in DB:`,
      seller
        ? { id: seller._id, status: seller.status, isDeleted: seller.isDeleted }
        : "MISSING",
    );
    console.log(`  HasSellerAccount computed: ${!!sellerForLogin}`);
  }

  await mongoose.disconnect();
}

testAllStoreOwners().catch(console.error);
