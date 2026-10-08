import mongoose from "mongoose";
import config from "../src/config";

async function run() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  console.log("=== CHECKING USERS WITH hasSellerAccount FIELD IN DB ===");
  const usersWithField = await db
    .collection("users")
    .find({ hasSellerAccount: { $exists: true } })
    .toArray();
  console.log(
    `Users with hasSellerAccount field in users collection: ${usersWithField.length}`,
  );
  usersWithField.forEach((u) =>
    console.log(`- ${u.email}: hasSellerAccount = ${u.hasSellerAccount}`),
  );

  console.log("\n=== CHECKING ALL STORES ===");
  const stores = await db.collection("stores").find({}).toArray();
  console.log(`Total stores in db: ${stores.length}`);

  for (const s of stores) {
    const owner = await db.collection("users").findOne({ _id: s.owner });
    const seller = await db.collection("sellers").findOne({ user: s.owner });
    const sellerByStore = await db
      .collection("sellers")
      .findOne({ store: s._id });

    console.log(`Store: "${s.displayName || s.name || s._id}"`);
    console.log(
      `  Owner ID: ${s.owner} -> User: ${owner ? `${owner.name} (${owner.email}), activeRole: ${owner.activeRole}, role: ${owner.role}` : "NOT FOUND"}`,
    );
    console.log(
      `  Seller by user ID:`,
      seller
        ? `_id: ${seller._id}, status: ${seller.status}, isDeleted: ${seller.isDeleted}, store: ${seller.store}`
        : "NONE",
    );
    if (
      sellerByStore &&
      (!seller || seller._id.toString() !== sellerByStore._id.toString())
    ) {
      console.log(
        `  Seller by store ID:`,
        `_id: ${sellerByStore._id}, status: ${sellerByStore.status}, user: ${sellerByStore.user}`,
      );
    }
  }

  console.log("\n=== CHECKING ALL SELLERS ===");
  const sellers = await db.collection("sellers").find({}).toArray();
  console.log(`Total sellers in db: ${sellers.length}`);
  for (const sel of sellers) {
    const u = await db.collection("users").findOne({ _id: sel.user });
    const st = await db.collection("stores").findOne({ _id: sel.store });
    console.log(
      `Seller _id: ${sel._id}, status: ${sel.status}, isDeleted: ${sel.isDeleted}`,
    );
    console.log(
      `  User: ${u ? `${u.name} (${u.email})` : sel.user}, Store: ${st ? st.displayName : sel.store}`,
    );
  }

  await mongoose.disconnect();
}

run().catch(console.error);
