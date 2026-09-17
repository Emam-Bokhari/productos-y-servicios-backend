import mongoose from "mongoose";
import config from "../src/config";
import { StoreCategory } from "../src/app/modules/storeCategory/storeCategory.model";
import { CityAdConfiguration } from "../src/app/modules/cityAdConfiguration/cityAdConfiguration.model";
import { SubscriptionPackage } from "../src/app/modules/subscriptionPackage/subscriptionPackage.model";

async function inspect() {
  await mongoose.connect(config.database_url as string);

  const categories = await StoreCategory.find().limit(3);
  console.log("Categories:", categories.map(c => ({ id: c._id.toString(), name: (c as any).name })));

  const cities = await CityAdConfiguration.find({ status: "active" }).limit(3);
  console.log("Active Cities:", cities.map(c => ({ id: c._id.toString(), city: c.city, featuredCapacity: c.featuredCapacity })));

  const packages = await SubscriptionPackage.find();
  console.log("All Packages:", packages.map(p => ({ id: p._id.toString(), name: p.name, type: p.packageType, status: p.status, price: p.price, duration: p.duration })));

  await mongoose.disconnect();
}

inspect();
