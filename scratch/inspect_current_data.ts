import mongoose from "mongoose";
import config from "../src/config";

async function inspect() {
  try {
    console.log(
      "Connecting to:",
      config.database_url
        ? config.database_url.substring(0, 20) + "..."
        : "undefined",
    );
    await mongoose.connect(config.database_url as string);
    console.log("Connected successfully!");

    const db = mongoose.connection.db;
    if (!db) {
      console.log("No DB instance!");
      return;
    }

    const collections = await db.listCollections().toArray();
    console.log("\n=== COLLECTIONS AND COUNTS ===");
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`${col.name}: ${count}`);
    }

    console.log("\n=== USERS ===");
    const users = await db
      .collection("users")
      .find({})
      .project({
        _id: 1,
        name: 1,
        email: 1,
        role: 1,
        activeRole: 1,
        status: 1,
        verified: 1,
        isVerified: 1,
        isDeleted: 1,
      })
      .toArray();
    console.log(`Total users: ${users.length}`);
    console.log(JSON.stringify(users, null, 2));

    console.log("\n=== SUBSCRIPTION PACKAGES ===");
    const packages = await db
      .collection("subscriptionpackages")
      .find({})
      .toArray();
    console.log(`Total packages: ${packages.length}`);
    console.log(JSON.stringify(packages, null, 2));

    console.log("\n=== CITY AD CONFIGURATIONS ===");
    const cityConfigs = await db
      .collection("cityadconfigurations")
      .find({})
      .toArray();
    console.log(`Total city configs: ${cityConfigs.length}`);
    console.log(JSON.stringify(cityConfigs, null, 2));

    console.log("\n=== STORE CATEGORIES ===");
    const storeCategories = await db
      .collection("storecategories")
      .find({})
      .toArray();
    console.log(`Total store categories: ${storeCategories.length}`);
    console.log(JSON.stringify(storeCategories.slice(0, 5), null, 2));
  } catch (err) {
    console.error("Error inspecting DB:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

inspect();
