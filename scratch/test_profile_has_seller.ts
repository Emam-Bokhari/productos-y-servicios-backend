import mongoose from "mongoose";
import config from "../src/config";
import "../src/app/modules/subscriptionPackage/subscriptionPackage.model";
import { UserService } from "../src/app/modules/user/user.service";

async function testProfiles() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const testEmails = [
    "studentemam@gmail.com",
    "service@gmail.com",
    "adrianrivego@hotmail.com",
    "bokhari1@gmail.com",
  ];

  console.log("=== TESTING getMyProfileFromDB ===");
  for (const email of testEmails) {
    const user = await db.collection("users").findOne({ email });
    if (!user) continue;

    const profile = await UserService.getMyProfileFromDB(user._id.toString());
    console.log(`- ${email}:`);
    console.log(`    hasSellerAccount: ${profile.hasSellerAccount}`);
    console.log(`    isStoreCreated: ${profile.isStoreCreated}`);
    console.log(`    activeRole: ${profile.activeRole}`);
  }

  await mongoose.disconnect();
}

testProfiles().catch(console.error);
