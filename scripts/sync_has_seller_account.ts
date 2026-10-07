import mongoose from "mongoose";
import config from "../src/config";

async function syncHasSellerAccount() {
  console.log("==================================================================");
  console.log("🔄 SYNCING hasSellerAccount AND SELLER PROFILES IN MONGODB");
  console.log("==================================================================");

  await mongoose.connect(config.database_url as string);
  console.log("✔ Connected to MongoDB.");
  const db = mongoose.connection.db!;

  // 1. Ensure the 3 Adrian alias accounts have their own active stores and seller profiles
  const adrianHotmail = await db.collection("users").findOne({ email: "adrianrivego@hotmail.com" });
  const furnitureStore = await db.collection("stores").findOne({ displayName: "Mueblería & Confort Hogar" });

  const adrianAliases = [
    { email: "adrianrivego@gmail.com", storeName: "Mueblería & Confort Hogar - Sucursal Norte" },
    { email: "adrianrivera@gmail.com", storeName: "Mueblería & Confort Hogar - Sucursal Sur" },
    { email: "adrianrivera@hotmail.com", storeName: "Mueblería & Confort Hogar - Sucursal Cumbayá" },
  ];

  if (furnitureStore) {
    for (const alias of adrianAliases) {
      const aliasUser = await db.collection("users").findOne({ email: alias.email });
      if (aliasUser) {
        let store = await db.collection("stores").findOne({ owner: aliasUser._id });
        if (!store) {
          const newStoreDoc = {
            ...furnitureStore,
            _id: new mongoose.Types.ObjectId(),
            owner: aliasUser._id,
            displayName: alias.storeName,
            email: alias.email,
            status: "active",
            isDeleted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await db.collection("stores").insertOne(newStoreDoc);
          store = newStoreDoc;
          console.log(`✔ Created store "${alias.storeName}" for alias ${alias.email}`);
        }

        let seller = await db.collection("sellers").findOne({ user: aliasUser._id });
        if (!seller) {
          await db.collection("sellers").insertOne({
            _id: new mongoose.Types.ObjectId(),
            user: aliasUser._id,
            store: store._id,
            status: "active",
            isDeleted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`✔ Created seller profile for alias ${alias.email}`);
        } else {
          await db.collection("sellers").updateOne(
            { _id: seller._id },
            { $set: { store: store._id, status: "active", isDeleted: false } }
          );
        }
      }
    }
  }

  // 2. Fetch all stores in the database
  const allStores = await db.collection("stores").find({ isDeleted: { $ne: true } }).toArray();
  console.log(`\nFound ${allStores.length} active stores in database.`);

  const storeOwnerIds = new Set<string>();

  for (const store of allStores) {
    if (!store.owner) continue;
    storeOwnerIds.add(store.owner.toString());

    // Ensure seller record exists and is active
    await db.collection("sellers").updateOne(
      { user: store.owner },
      {
        $set: {
          store: store._id,
          status: "active",
          isDeleted: false,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          _id: new mongoose.Types.ObjectId(),
          user: store.owner,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Update user document: hasSellerAccount = true, activeRole = 'seller'
    await db.collection("users").updateOne(
      { _id: store.owner },
      {
        $set: {
          hasSellerAccount: true,
          activeRole: "seller",
        },
      }
    );

    const ownerDoc = await db.collection("users").findOne({ _id: store.owner });
    console.log(`✔ Updated store owner: ${ownerDoc?.email} -> hasSellerAccount: true, activeRole: seller (Store: "${store.displayName}")`);
  }

  // 3. For all other users who do not own a store
  const allUsers = await db.collection("users").find({}).toArray();
  let nonSellerCount = 0;

  for (const user of allUsers) {
    if (!storeOwnerIds.has(user._id.toString())) {
      // Check if they have an active seller profile linked to a store
      const seller = await db.collection("sellers").findOne({
        user: user._id,
        status: "active",
        isDeleted: { $ne: true },
      });

      if (seller) {
        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { hasSellerAccount: true } }
        );
      } else {
        await db.collection("users").updateOne(
          { _id: user._id },
          { $set: { hasSellerAccount: false } }
        );
        nonSellerCount++;
      }
    }
  }

  console.log(`\n✔ Updated ${nonSellerCount} regular/admin users with hasSellerAccount: false`);

  // 4. Verification summary
  console.log("\n==================================================================");
  console.log("📊 VERIFICATION RESULTS");
  console.log("==================================================================");

  const sellersWithTrue = await db.collection("users").find({ hasSellerAccount: true }).toArray();
  console.log(`Total users with hasSellerAccount: true -> ${sellersWithTrue.length}`);
  for (const u of sellersWithTrue) {
    const st = await db.collection("stores").findOne({ owner: u._id });
    const sl = await db.collection("sellers").findOne({ user: u._id });
    console.log(`  - ${u.email} (${u.name}): Store = "${st?.displayName}", Seller = ${sl ? sl.status : 'NONE'}`);
  }

  const sellersWithFalse = await db.collection("users").find({ hasSellerAccount: false }).toArray();
  console.log(`\nTotal users with hasSellerAccount: false -> ${sellersWithFalse.length}`);

  const undefinedCount = await db.collection("users").countDocuments({ hasSellerAccount: { $exists: false } });
  console.log(`Total users with hasSellerAccount: undefined -> ${undefinedCount}`);

  await mongoose.disconnect();
  console.log("\n✔ Database sync finished successfully.");
}

syncHasSellerAccount().catch(console.error);
