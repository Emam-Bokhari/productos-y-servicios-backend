import mongoose from "mongoose";
import bcrypt from "bcrypt";
import config from "../src/config";

async function updateUsersMatching() {
  console.log("=================================================");
  console.log("🔧 STARTING USERS DATA SYNCHRONIZATION SCRIPT");
  console.log("=================================================");

  await mongoose.connect(config.database_url as string);
  console.log("✔ Connected to MongoDB successfully.");

  const db = mongoose.connection.db!;
  const saltRounds = Number(config.bcrypt_salt_rounds) || 12;
  const commonPasswordHash = await bcrypt.hash("12345678", saltRounds);

  // 1. Get active store creation package
  const activePackage = await db.collection("subscriptionpackages").findOne({
    packageType: "store_creation",
    status: "active",
  });
  const packageId = activePackage?._id || new mongoose.Types.ObjectId("6a7ff377c24d0046a564c737");
  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  // 2. Fetch all stores to match store owners
  const stores = await db.collection("stores").find({}).toArray();
  console.log(`\n🏪 Found ${stores.length} active stores. Updating Store Owners...`);

  const ownerObjectIds = stores.map((s) => s.owner as mongoose.Types.ObjectId);

  for (const store of stores) {
    const ownerId = store.owner;
    const storeLocation = {
      type: "Point",
      coordinates: [store.longitude || -78.52495, store.latitude || -0.22985],
      address: store.streetAddress || `${store.city}, Ecuador`,
      country: store.country || "Ecuador",
      province: store.province || "Pichincha",
      city: store.city || "Quito",
      canton: store.canton || store.city || "Quito",
      sector: store.sector || "",
      neighborhood: store.neighborhood || "",
    };

    const updateDoc = {
      $set: {
        role: "user",
        activeRole: "seller",
        status: "active",
        verified: true,
        isVerified: true,
        password: commonPasswordHash,
        subscriptionStatus: "active",
        subscriptionPackageId: packageId,
        subscriptionExpiresAt: oneYearFromNow,
        phone: store.phone || "+593984123456",
        countryCode: "+593",
        country: store.country || "Ecuador",
        province: store.province || "Pichincha",
        city: store.city || "Quito",
        canton: store.canton || store.city || "Quito",
        sector: store.sector || "",
        neighborhood: store.neighborhood || "",
        postalCode: store.postalCode || "170150",
        address: store.streetAddress || `${store.city}, Ecuador`,
        documentType: store.documentType || "nid",
        documentNumber: store.documentNumber || "1712345678",
        documentFront: store.documentFront || "/uploads/documentFront/sample-front.jpg",
        documentBack: store.documentBack || "/uploads/documentBack/sample-back.jpg",
        location: storeLocation,
        averageRating: store.averageRating || 5.0,
        totalRatings: store.ratingCount || 10,
        totalReviews: store.ratingCount || 10,
        timezone: "America/Guayaquil",
      },
    };

    await db.collection("users").updateOne({ _id: ownerId }, updateDoc);
    const ownerDoc = await db.collection("users").findOne({ _id: ownerId });
    console.log(`   ✔ Updated Store Owner: ${ownerDoc?.name} (${ownerDoc?.email}) -> Store: "${store.displayName}"`);
  }

  // 3. Update all non-store owner users (Customers & Admins)
  console.log("\n👤 Updating Customer & Buyer accounts (Non-Store Owners)...");
  const regularUsers = await db.collection("users").find({
    _id: { $nin: ownerObjectIds },
  }).toArray();

  for (const user of regularUsers) {
    const isSuperOrAdmin = ["super_admin", "admin"].includes(user.role);
    const customerLocation = {
      type: "Point",
      coordinates: [-78.52495, -0.22985], // Quito, Ecuador
      address: "Av. Amazonas y Naciones Unidas, Quito",
      country: "Ecuador",
      province: "Pichincha",
      city: "Quito",
      canton: "Quito",
      sector: "Quito",
      neighborhood: "La Carolina",
    };

    const updateCustomerDoc: any = {
      $set: {
        activeRole: "user",
        status: "active",
        verified: true,
        isVerified: true,
        password: commonPasswordHash,
        subscriptionStatus: "none",
        phone: user.phone || "+593991234567",
        countryCode: "+593",
        country: "Ecuador",
        province: "Pichincha",
        city: "Quito",
        canton: "Quito",
        sector: "Quito",
        neighborhood: "La Carolina",
        postalCode: "170150",
        address: "Av. Amazonas y Naciones Unidas, Quito",
        documentType: "nid",
        documentNumber: "1798765432",
        documentFront: "/uploads/documentFront/sample-front.jpg",
        documentBack: "/uploads/documentBack/sample-back.jpg",
        location: customerLocation,
        averageRating: 0,
        totalRatings: 0,
        totalReviews: 0,
        timezone: "America/Guayaquil",
      },
      $unset: {
        subscriptionPackageId: "",
        subscriptionExpiresAt: "",
      },
    };

    if (isSuperOrAdmin) {
      updateCustomerDoc.$set.role = user.role;
    } else {
      updateCustomerDoc.$set.role = "user";
    }

    await db.collection("users").updateOne({ _id: user._id }, updateCustomerDoc);
    console.log(`   ✔ Updated User: ${user.name} (${user.email}) [Role: ${user.role}, ActiveRole: user]`);
  }

  console.log("\n=================================================");
  console.log("🎉 ALL USERS SYNCHRONIZED SUCCESSFULLY!");
  console.log("=================================================");
  console.log("🔑 Universal Test Password set for all accounts: 12345678");
  console.log("=================================================\n");

  await mongoose.disconnect();
  console.log("✔ Disconnected from MongoDB.");
}

updateUsersMatching().catch((err) => {
  console.error("❌ Error updating users:", err);
  process.exit(1);
});
