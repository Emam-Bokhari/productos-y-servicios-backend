import mongoose from "mongoose";
import config from "../src/config";

async function run() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const emails = [
    "adrianrivego@gmail.com",
    "adrianrivera@gmail.com",
    "adrianrivera@hotmail.com",
    "adrianrivego@hotmail.com",
    "studentemam@gmail.com",
    "bokhari1@gmail.com"
  ];

  for (const email of emails) {
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      console.log(`User ${email} NOT FOUND`);
      continue;
    }
    const store = await db.collection("stores").findOne({ owner: user._id });
    const seller = await db.collection("sellers").findOne({ user: user._id });
    console.log(`\nEmail: ${email}`);
    console.log(`  User ID: ${user._id}, Name: ${user.name}, Role: ${user.role}, activeRole: ${user.activeRole}, subStatus: ${user.subscriptionStatus}`);
    console.log(`  Store:`, store ? { _id: store._id, name: store.displayName, status: store.status, isDeleted: store.isDeleted } : 'NO STORE');
    console.log(`  Seller:`, seller ? { _id: seller._id, status: seller.status, isDeleted: seller.isDeleted, store: seller.store } : 'NO SELLER');
  }

  // Also check ALL stores and see if any store has an owner that has NO seller record:
  console.log("\n=== CHECKING ALL STORES FOR MISSING SELLERS ===");
  const allStores = await db.collection("stores").find({}).toArray();
  for (const st of allStores) {
    const sOwner = await db.collection("users").findOne({ _id: st.owner });
    const sSeller = await db.collection("sellers").findOne({ user: st.owner });
    if (!sSeller) {
      console.log(`Store "${st.displayName}" (${st._id}) owner ${st.owner} (${sOwner?.email}) HAS NO SELLER RECORD!`);
    } else if (sSeller.status !== "active" || sSeller.isDeleted) {
      console.log(`Store "${st.displayName}" owner ${st.owner} (${sOwner?.email}) seller status is ${sSeller.status}, isDeleted: ${sSeller.isDeleted}`);
    }
  }

  // Also check if any users have stores by email or name matching, or if there are orphaned stores:
  console.log("\n=== ALL USERS WITH activeRole == 'seller' ===");
  const sellerRoleUsers = await db.collection("users").find({ activeRole: "seller" }).toArray();
  for (const u of sellerRoleUsers) {
    const st = await db.collection("stores").findOne({ owner: u._id });
    const sel = await db.collection("sellers").findOne({ user: u._id });
    console.log(`User: ${u.email} (${u._id})`);
    console.log(`  Store: ${st ? st.displayName : 'NO STORE'}`);
    console.log(`  Seller: ${sel ? `status: ${sel.status}, isDeleted: ${sel.isDeleted}` : 'NO SELLER'}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
