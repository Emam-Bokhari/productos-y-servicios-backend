import mongoose from "mongoose";
import config from "../src/config";
import { AuthService } from "../src/app/modules/auth/auth.service";

async function checkAll() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const allUsers = await db.collection("users").find({}).toArray();
  console.log(`Total users in DB: ${allUsers.length}\n`);

  for (const u of allUsers) {
    const store = await db.collection("stores").findOne({ owner: u._id });
    const seller = await db.collection("sellers").findOne({ user: u._id });

    let loginHasSeller = "N/A";
    try {
      const loginRes = await AuthService.loginUserFromDB({
        email: u.email,
        password: "password", // this won't match for non-12345678, but let's check seller doc directly
      });
      loginHasSeller = String(loginRes.hasSellerAccount);
    } catch (err: any) {
      // Direct seller check:
      const activeSeller = await db.collection("sellers").findOne({
        user: u._id,
        status: "active",
        $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }],
      });
      loginHasSeller = activeSeller ? "true (via db)" : "false (via db)";
    }

    console.log(`User: ${u.email} (${u.name})`);
    console.log(`  _id: ${u._id}`);
    console.log(`  role: ${u.role}, activeRole: ${u.activeRole}`);
    console.log(`  hasSellerAccount in user doc: ${u.hasSellerAccount}`);
    console.log(
      `  store: ${store ? `YES ("${store.displayName}", _id: ${store._id}, status: ${store.status})` : "NO"}`,
    );
    console.log(
      `  seller: ${seller ? `YES (_id: ${seller._id}, status: ${seller.status}, isDeleted: ${seller.isDeleted})` : "NO"}`,
    );
    console.log(`  computed hasSeller: ${loginHasSeller}`);
    console.log(`-----------------------------------------------`);
  }

  await mongoose.disconnect();
}

checkAll().catch(console.error);
