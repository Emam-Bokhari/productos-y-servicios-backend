import mongoose from "mongoose";
import config from "../src/config";
import { SubscriptionPackage } from "../src/app/modules/subscriptionPackage/subscriptionPackage.model";
import { User } from "../src/app/modules/user/user.model";

async function findData() {
  await mongoose.connect(config.database_url as string);
  console.log("Connected to DB");

  const packages = await SubscriptionPackage.find().limit(5);
  console.log("Packages count:", packages.length);
  packages.forEach((p) => {
    console.log(`Package: ID=${p._id}, Name=${p.name}, Price=${p.price}, Type=${p.packageType}, Duration=${p.duration}`);
  });

  const users = await User.find().limit(5);
  console.log("Users count:", users.length);
  users.forEach((u) => {
    console.log(`User: ID=${u._id}, Email=${u.email}, Name=${u.name}, Status=${u.subscriptionStatus}`);
  });

  await mongoose.disconnect();
}

findData();
