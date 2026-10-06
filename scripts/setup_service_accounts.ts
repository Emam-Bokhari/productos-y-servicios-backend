import mongoose from "mongoose";
import bcrypt from "bcrypt";
import config from "../src/config";

async function setupServiceAccounts() {
  console.log("=================================================");
  console.log("🔧 CONFIGURING SERVICE ACCOUNTS AND SWAP");
  console.log("=================================================");

  await mongoose.connect(config.database_url as string);
  console.log("✔ Connected to MongoDB.");

  const db = mongoose.connection.db!;
  const saltRounds = Number(config.bcrypt_salt_rounds) || 12;
  const commonPasswordHash = await bcrypt.hash("12345678", saltRounds);

  const serviceStore = await db.collection("stores").findOne({ displayName: "ServiPro - Limpieza & Mantenimiento Integral" });
  const furnitureStore = await db.collection("stores").findOne({ displayName: "Mueblería & Confort Hogar" });
  const serviceUser = await db.collection("users").findOne({ email: "service@gmail.com" });
  const adrianUser = await db.collection("users").findOne({ email: "adrianrivego@hotmail.com" });

  if (!serviceStore || !serviceUser || !adrianUser || !furnitureStore) {
    console.error("Missing required entities!");
    return;
  }

  // Temporary owner & seller to avoid unique index violation during swap
  const tempOwnerId = new mongoose.Types.ObjectId();
  await db.collection("stores").updateOne({ _id: furnitureStore._id }, { $set: { owner: tempOwnerId } });
  await db.collection("sellers").updateOne({ store: furnitureStore._id }, { $set: { user: tempOwnerId } });

  // 1. Assign ServiPro to service@gmail.com
  await db.collection("stores").updateOne(
    { _id: serviceStore._id },
    { $set: { owner: serviceUser._id, email: "service@gmail.com" } }
  );

  await db.collection("sellers").updateOne(
    { store: serviceStore._id },
    { $set: { user: serviceUser._id, status: "active" } }
  );

  // 2. Assign Mueblería to adrianUser
  await db.collection("stores").updateOne(
    { _id: furnitureStore._id },
    { $set: { owner: adrianUser._id, email: "adrianrivego@hotmail.com" } }
  );

  await db.collection("sellers").updateOne(
    { store: furnitureStore._id },
    { $set: { user: adrianUser._id, status: "active" } }
  );

  await db.collection("services").updateMany(
    { storeId: serviceStore._id },
    { $set: { sellerId: serviceUser._id } }
  );

  await db.collection("advertisements").updateMany(
    { storeId: serviceStore._id },
    { $set: { sellerId: serviceUser._id } }
  );

  await db.collection("subscriptions").updateMany(
    { userId: adrianUser._id },
    { $set: { userId: serviceUser._id } }
  );

  await db.collection("transactions").updateMany(
    { userId: adrianUser._id },
    { $set: { userId: serviceUser._id } }
  );

  // Update service@gmail.com user details
  await db.collection("users").updateOne(
    { _id: serviceUser._id },
    {
      $set: {
        role: "user",
        activeRole: "seller",
        status: "active",
        verified: true,
        isVerified: true,
        password: commonPasswordHash,
        subscriptionStatus: "active",
        subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        subscriptionPackageId: new mongoose.Types.ObjectId("6a7ff377c24d0046a564c737"),
        phone: "+593946789012",
        countryCode: "+593",
        country: "Ecuador",
        province: "Pichincha",
        city: "Quito",
        canton: "Quito",
        sector: "Quito",
        neighborhood: "La Carolina",
        address: "Av. República del Salvador 345, Quito",
        location: {
          type: "Point",
          coordinates: [-78.52495, -0.22985],
          address: "Av. República del Salvador 345, Quito",
          country: "Ecuador",
          city: "Quito",
        },
        userName: "service",
      },
    }
  );
  console.log(`✔ Assigned 'ServiPro' store to service@gmail.com (Username: service)`);

  await db.collection("products").updateMany(
    { storeId: furnitureStore._id },
    { $set: { sellerId: adrianUser._id } }
  );

  await db.collection("users").updateOne(
    { _id: adrianUser._id },
    {
      $set: {
        role: "user",
        activeRole: "seller",
        status: "active",
        verified: true,
        isVerified: true,
        password: commonPasswordHash,
        subscriptionStatus: "active",
        userName: "adrianrivego",
      },
    }
  );
  console.log(`✔ Updated adrianrivego@hotmail.com with password '12345678' and username 'adrianrivego'`);

  // 3. Create aliases/variations so typo-proofing is 100% complete
  const aliases = [
    { email: "adrianrivego@gmail.com", name: "Adrian Rivera" },
    { email: "adrianrivera@gmail.com", name: "Adrian Rivera" },
    { email: "adrianrivera@hotmail.com", name: "Adrian Rivera" },
  ];

  for (const alias of aliases) {
    const existing = await db.collection("users").findOne({ email: alias.email });
    if (!existing) {
      await db.collection("users").insertOne({
        name: alias.name,
        email: alias.email,
        role: "user",
        activeRole: "seller",
        status: "active",
        verified: true,
        isVerified: true,
        password: commonPasswordHash,
        subscriptionStatus: "active",
        subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        subscriptionPackageId: new mongoose.Types.ObjectId("6a7ff377c24d0046a564c737"),
        phone: "+593946789012",
        countryCode: "+593",
        country: "Ecuador",
        province: "Pichincha",
        city: "Quito",
        canton: "Quito",
        sector: "Quito",
        neighborhood: "La Carolina",
        address: "Av. República del Salvador 345, Quito",
        location: {
          type: "Point",
          coordinates: [-78.52495, -0.22985],
          address: "Av. República del Salvador 345, Quito",
          country: "Ecuador",
          city: "Quito",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      });
      console.log(`✔ Created alias user: ${alias.email} with password '12345678'`);
    } else {
      await db.collection("users").updateOne(
        { email: alias.email },
        {
          $set: {
            password: commonPasswordHash,
            verified: true,
            status: "active",
            activeRole: "seller",
            subscriptionStatus: "active",
          },
        }
      );
      console.log(`✔ Updated existing alias user: ${alias.email}`);
    }
  }

  console.log("\n🎉 ALL ACCOUNTS READY!");
  await mongoose.disconnect();
}

setupServiceAccounts();
