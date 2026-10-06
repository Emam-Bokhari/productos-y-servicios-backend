import mongoose from "mongoose";
import config from "../src/config";

async function checkConfigs() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const packages = await db
    .collection("subscriptionpackages")
    .find({ isDeleted: { $ne: true } })
    .toArray();
  console.log("=== ACTIVE SUBSCRIPTION PACKAGES ===");
  console.log(
    packages.map((p) => ({
      id: p._id,
      name: p.name,
      type: p.packageType,
      price: p.price,
      duration: p.duration,
    })),
  );

  const cities = await db
    .collection("cityadconfigurations")
    .find({ isDeleted: { $ne: true } })
    .toArray();
  console.log("\n=== ACTIVE CITY AD CONFIGS ===");
  console.log(
    cities.map((c) => ({
      id: c._id,
      city: c.city,
      country: c.country,
      status: c.status,
      capacity: c.featuredCapacity,
    })),
  );

  const prodCategories = await db
    .collection("storecategories")
    .find({ isDeleted: { $ne: true }, type: "product", parentId: null })
    .limit(10)
    .toArray();
  console.log("\n=== TOP PRODUCT CATEGORIES ===");
  console.log(prodCategories.map((c) => ({ id: c._id, name: c.name })));

  const serviceCategories = await db
    .collection("storecategories")
    .find({ isDeleted: { $ne: true }, type: "service", parentId: null })
    .limit(10)
    .toArray();
  console.log("\n=== TOP SERVICE CATEGORIES ===");
  console.log(serviceCategories.map((c) => ({ id: c._id, name: c.name })));

  const users = await db
    .collection("users")
    .find({ isDeleted: { $ne: true } })
    .toArray();
  console.log("\n=== ACTIVE USERS COUNT ===", users.length);
  console.log(
    "Roles breakdown:",
    users.reduce((acc: any, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {}),
  );

  console.log(
    "Sample non-admin users:",
    users
      .filter((u) => u.role === "user")
      .slice(0, 5)
      .map((u) => ({ id: u._id, name: u.name, email: u.email })),
  );

  await mongoose.disconnect();
}
checkConfigs();
