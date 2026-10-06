import mongoose from "mongoose";
import config from "../src/config";
import { AuthService } from "../src/app/modules/auth/auth.service";

async function testLogin() {
  await mongoose.connect(config.database_url as string);
  console.log("✔ Connected to MongoDB.");

  console.log("\n🧪 TEST 1: Logging in as SELLER (studentemam@gmail.com)...");
  try {
    const sellerRes = await AuthService.loginUserFromDB({
      email: "studentemam@gmail.com",
      password: "password" in { password: "12345678" } ? "12345678" : "",
    });
    console.log("   ✔ Seller Login SUCCESS!");
    console.log(`   - Name: ${sellerRes.user.name}`);
    console.log(`   - ActiveRole: ${sellerRes.user.activeRole}`);
    console.log(`   - HasSellerAccount: ${sellerRes.hasSellerAccount}`);
    console.log(`   - SubStatus: ${sellerRes.user.subscriptionStatus}`);
    console.log(`   - Token generated: ${sellerRes.token.substring(0, 25)}...`);
  } catch (err: any) {
    console.error("   ❌ Seller login failed:", err.message);
  }

  console.log("\n🧪 TEST 2: Logging in as CUSTOMER (bokhari1@gmail.com)...");
  try {
    const custRes = await AuthService.loginUserFromDB({
      email: "bokhari1@gmail.com",
      password: "12345678",
    });
    console.log("   ✔ Customer Login SUCCESS!");
    console.log(`   - Name: ${custRes.user.name}`);
    console.log(`   - ActiveRole: ${custRes.user.activeRole}`);
    console.log(`   - HasSellerAccount: ${custRes.hasSellerAccount}`);
    console.log(`   - SubStatus: ${custRes.user.subscriptionStatus}`);
    console.log(`   - Token generated: ${custRes.token.substring(0, 25)}...`);
  } catch (err: any) {
    console.error("   ❌ Customer login failed:", err.message);
  }

  await mongoose.disconnect();
}

testLogin();
