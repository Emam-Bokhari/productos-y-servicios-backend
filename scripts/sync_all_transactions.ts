import mongoose, { Types } from "mongoose";
import config from "../src/config";

async function syncAllTransactions() {
  await mongoose.connect(config.database_url as string);
  console.log("Connected to MongoDB.");

  const db = mongoose.connection.db!;

  // 1. Fetch SubscriptionPackages
  const storePackage = await db.collection("subscriptionpackages").findOne({
    packageType: "store_creation",
    status: "active",
  }) || await db.collection("subscriptionpackages").findOne({
    status: "active",
  });

  if (!storePackage) {
    throw new Error("No active store_creation package found!");
  }
  console.log(`Using Store Package: "${storePackage.name}" ($${storePackage.price})`);

  // 2. Fetch City Configurations
  const cityConfigs = await db.collection("cityadconfigurations").find({}).toArray();
  const quitoCity = cityConfigs.find((c) => c.city.toLowerCase() === "quito") || cityConfigs[0];
  const guayaquilCity = cityConfigs.find((c) => c.city.toLowerCase() === "guayaquil") || cityConfigs[1] || quitoCity;
  console.log(`Loaded ${cityConfigs.length} city ad configurations.`);

  // 3. Fix / Sync all existing advertisements and their transactions
  console.log("\n--- 1. Syncing Advertisements with Transactions ---");
  const allAds = await db.collection("advertisements").find({ isDeleted: { $ne: true } }).toArray();
  console.log(`Found ${allAds.length} active advertisements.`);

  let txInvoiceCounter = 2000;

  for (let i = 0; i < allAds.length; i++) {
    const ad = allAds[i];
    let tx: any = null;

    if (ad.transactionId) {
      tx = await db.collection("transactions").findOne({ _id: ad.transactionId });
    }

    if (!tx) {
      tx = await db.collection("transactions").findOne({
        userId: ad.sellerId,
        transactionType: "advertisement_payment",
      });
    }

    // Resolve city details
    let cityCfg = cityConfigs.find(
      (c) => c._id.toString() === (ad.cityAdConfigId?.toString())
    );
    if (!cityCfg && ad.city) {
      cityCfg = cityConfigs.find((c) => c.city.toLowerCase() === ad.city.toLowerCase());
    }
    const resolvedCity = cityCfg || quitoCity;

    const metadata = {
      bookingType: "advertisement",
      cityConfigId: resolvedCity._id.toString(),
      cityName: resolvedCity.city || ad.city || "Quito",
      province: resolvedCity.province || "Pichincha",
      sector: resolvedCity.sector || ad.sector || "Norte",
      neighborhood: resolvedCity.neighborhood || ad.neighborhood || "Centro",
      country: resolvedCity.country || "Ecuador",
      position: String(ad.position || 1),
      durationDays: "7",
    };

    if (tx) {
      // Update existing transaction metadata
      await db.collection("transactions").updateOne(
        { _id: tx._id },
        {
          $set: {
            transactionType: "advertisement_payment",
            paymentStatus: "PAID",
            metadata: {
              ...(tx.metadata || {}),
              ...metadata,
              merchantTransactionId: tx.transactionId,
            },
            storeId: tx.storeId || ad.storeId,
            updatedAt: new Date(),
          },
        }
      );
      if (!ad.transactionId || ad.transactionId.toString() !== tx._id.toString()) {
        await db.collection("advertisements").updateOne(
          { _id: ad._id },
          { $set: { transactionId: tx._id, updatedAt: new Date() } }
        );
      }
      console.log(`   ✔ Updated Transaction for Ad: "${ad.campaignName}" (TX: ${tx.transactionId})`);
    } else {
      // Create new Transaction for Ad
      txInvoiceCounter++;
      const txId = `INV-2026-${txInvoiceCounter}`;
      const safeInvoice = txId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const insertResult = await db.collection("transactions").insertOne({
        transactionId: txId,
        userId: ad.sellerId,
        storeId: ad.storeId,
        amount: ad.price || 25,
        paymentMethod: "DATAFAST",
        paymentStatus: "PAID",
        transactionType: "advertisement_payment",
        gatewayTransactionId: `gw_datafast_ad_${Date.now()}_${i + 1}`,
        description: `Pago de Anuncio Publicitario: ${ad.campaignName}`,
        invoiceUrl: `/uploads/invoices/${safeInvoice}.pdf`,
        metadata: {
          ...metadata,
          merchantTransactionId: txId,
        },
        isDeleted: false,
        createdAt: ad.createdAt || new Date(),
        updatedAt: new Date(),
      });

      await db.collection("advertisements").updateOne(
        { _id: ad._id },
        { $set: { transactionId: insertResult.insertedId, updatedAt: new Date() } }
      );
      console.log(`   ✔ Created new Transaction ${txId} for Ad: "${ad.campaignName}"`);
    }
  }

  // 4. Ensure EVERY Store has a Subscription and Transaction
  console.log("\n--- 2. Syncing Stores with Subscriptions & Transactions ---");
  const allStores = await db.collection("stores").find({ isDeleted: { $ne: true } }).toArray();
  console.log(`Found ${allStores.length} stores.`);

  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < allStores.length; i++) {
    const store = allStores[i];
    const ownerId = store.owner;

    // Check subscription
    let sub = await db.collection("subscriptions").findOne({
      userId: ownerId,
      packageType: "store_creation",
      isDeleted: { $ne: true },
    });

    if (!sub) {
      txInvoiceCounter++;
      const subTrxId = `TRX-SUB-${Date.now()}-${i + 1}`;
      const invNum = `INV-2026-${txInvoiceCounter}`;
      const safeInvoice = invNum.replace(/[^a-zA-Z0-9_-]/g, "_");

      const insertSub = await db.collection("subscriptions").insertOne({
        userId: ownerId,
        packageId: storePackage._id,
        packageType: "store_creation",
        status: "active",
        expiresAt: oneYearFromNow,
        amountPaid: storePackage.price || 18,
        trxId: subTrxId,
        checkoutSessionId: `cs_store_${Date.now()}_${i + 1}`,
        invoiceNumber: invNum,
        invoiceUrl: `/uploads/invoices/${safeInvoice}.pdf`,
        createdAt: store.createdAt || new Date(),
        updatedAt: new Date(),
      });
      sub = { _id: insertSub.insertedId, trxId: subTrxId, invoiceNumber: invNum };
      console.log(`   ✔ Created Store Subscription for Store: "${store.displayName}"`);
    }

    // Check transaction
    let tx = await db.collection("transactions").findOne({
      userId: ownerId,
      transactionType: { $in: ["subscription_payment", "subscription_renewal"] },
      isDeleted: { $ne: true },
    });

    if (!tx) {
      txInvoiceCounter++;
      const invNum = sub.invoiceNumber || `INV-2026-${txInvoiceCounter}`;
      const safeInvoice = invNum.replace(/[^a-zA-Z0-9_-]/g, "_");

      await db.collection("transactions").insertOne({
        transactionId: invNum,
        userId: ownerId,
        packageId: storePackage._id,
        storeId: store._id,
        amount: storePackage.price || 18,
        paymentMethod: "DATAFAST",
        paymentStatus: "PAID",
        transactionType: "subscription_payment",
        gatewayTransactionId: sub.trxId || `gw_datafast_sub_${Date.now()}_${i + 1}`,
        description: `Compra de membresía de tienda: ${storePackage.name}`,
        invoiceUrl: `/uploads/invoices/${safeInvoice}.pdf`,
        metadata: {
          bookingType: "store_creation",
          packageId: storePackage._id.toString(),
          merchantTransactionId: invNum,
        },
        isDeleted: false,
        createdAt: store.createdAt || new Date(),
        updatedAt: new Date(),
      });
      console.log(`   ✔ Created Transaction for Store: "${store.displayName}"`);
    }

    // Update user status
    await db.collection("users").updateOne(
      { _id: ownerId },
      {
        $set: {
          hasSellerAccount: true,
          subscriptionStatus: "active",
          subscriptionPackageId: storePackage._id,
          subscriptionExpiresAt: oneYearFromNow,
        },
      }
    );
  }

  // 5. Ensure Developer and Admin Accounts also have Store, Subscription & Post Ad Transactions
  console.log("\n--- 3. Ensuring Admin / Developer Accounts Have Complete Data ---");
  const testEmails = [
    "studentemam@gmail.com",
    "mdjowelahmed924@gmail.com",
    "admin@gmail.com",
    "emam@gmail.com",
  ];

  for (let idx = 0; idx < testEmails.length; idx++) {
    const email = testEmails[idx];
    const user = await db.collection("users").findOne({ email });
    if (!user) continue;

    console.log(`Processing Test/Admin User: ${user.name || email} (${email})`);

    // Ensure store exists
    let store = await db.collection("stores").findOne({ owner: user._id, isDeleted: { $ne: true } });
    if (!store) {
      const storeInsert = await db.collection("stores").insertOne({
        owner: user._id,
        storeType: "product_store",
        displayName: `${user.name || "Oficial"} Tienda VIP`,
        description: "Tienda oficial de productos y servicios premium en Ecuador.",
        cityId: quitoCity._id,
        logo: "https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=400&q=80",
        coverImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
        phone: "+593984123456",
        whatsapp: "+593984123456",
        email: user.email,
        streetAddress: "Av. Amazonas y Naciones Unidas",
        country: "Ecuador",
        province: "Pichincha",
        city: "Quito",
        canton: "Quito",
        status: "active",
        isVerified: true,
        visitorCount: 200,
        averageRating: 5.0,
        ratingCount: 15,
        workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        openingTime: "08:30",
        closingTime: "19:30",
        isOpen24Hours: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store = { _id: storeInsert.insertedId, displayName: `${user.name || "Oficial"} Tienda VIP` };
      console.log(`   ✔ Created Store for ${email}`);
    }

    // Ensure Seller document exists
    await db.collection("sellers").updateOne(
      { user: user._id },
      { $set: { user: user._id, store: store._id, status: "active" } },
      { upsert: true }
    );

    // Ensure Store Subscription exists
    let sub = await db.collection("subscriptions").findOne({
      userId: user._id,
      packageType: "store_creation",
    });
    if (!sub) {
      txInvoiceCounter++;
      const invNum = `INV-2026-${txInvoiceCounter}`;
      const safeInvoice = invNum.replace(/[^a-zA-Z0-9_-]/g, "_");
      await db.collection("subscriptions").insertOne({
        userId: user._id,
        packageId: storePackage._id,
        packageType: "store_creation",
        status: "active",
        expiresAt: oneYearFromNow,
        amountPaid: storePackage.price || 18,
        trxId: `TRX-SUB-${Date.now()}-${idx + 10}`,
        checkoutSessionId: `cs_store_${Date.now()}_${idx + 10}`,
        invoiceNumber: invNum,
        invoiceUrl: `/uploads/invoices/${safeInvoice}.pdf`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`   ✔ Created Subscription for ${email}`);
    }

    // Ensure Store Subscription Transaction exists
    let subTx = await db.collection("transactions").findOne({
      userId: user._id,
      transactionType: "subscription_payment",
    });
    if (!subTx) {
      txInvoiceCounter++;
      const invNum = `INV-2026-${txInvoiceCounter}`;
      const safeInvoice = invNum.replace(/[^a-zA-Z0-9_-]/g, "_");
      await db.collection("transactions").insertOne({
        transactionId: invNum,
        userId: user._id,
        packageId: storePackage._id,
        storeId: store._id,
        amount: storePackage.price || 18,
        paymentMethod: "DATAFAST",
        paymentStatus: "PAID",
        transactionType: "subscription_payment",
        gatewayTransactionId: `gw_datafast_sub_${Date.now()}_${idx + 10}`,
        description: `Compra de membresía de tienda: ${storePackage.name}`,
        invoiceUrl: `/uploads/invoices/${safeInvoice}.pdf`,
        metadata: {
          bookingType: "store_creation",
          packageId: storePackage._id.toString(),
          merchantTransactionId: invNum,
        },
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`   ✔ Created Subscription Transaction for ${email}`);
    }

    // Ensure Post Ad exists
    let ad = await db.collection("advertisements").findOne({
      sellerId: user._id,
      isDeleted: { $ne: true },
    });
    if (!ad) {
      const adInsert = await db.collection("advertisements").insertOne({
        sellerId: user._id,
        storeId: store._id,
        advertisementType: "featured",
        campaignName: `Campaña Destacada - ${store.displayName || "Ecuador"}`,
        featuredImage: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
        cityAdConfigId: quitoCity._id,
        city: quitoCity.city,
        position: 1,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: "active",
        price: 25,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      ad = {
        _id: adInsert.insertedId,
        campaignName: `Campaña Destacada - ${store.displayName || "Ecuador"}`,
        position: 1,
        price: 25,
      };
      console.log(`   ✔ Created Advertisement for ${email}`);
    }

    // Ensure Post Ad Transaction exists
    let adTx = await db.collection("transactions").findOne({
      userId: user._id,
      transactionType: "advertisement_payment",
    });
    if (!adTx) {
      txInvoiceCounter++;
      const invNum = `INV-2026-${txInvoiceCounter}`;
      const safeInvoice = invNum.replace(/[^a-zA-Z0-9_-]/g, "_");
      const insertAdTx = await db.collection("transactions").insertOne({
        transactionId: invNum,
        userId: user._id,
        storeId: store._id,
        amount: ad.price || 25,
        paymentMethod: "DATAFAST",
        paymentStatus: "PAID",
        transactionType: "advertisement_payment",
        gatewayTransactionId: `gw_datafast_ad_${Date.now()}_${idx + 10}`,
        description: `Pago de Anuncio Publicitario: ${ad.campaignName}`,
        invoiceUrl: `/uploads/invoices/${safeInvoice}.pdf`,
        metadata: {
          bookingType: "advertisement",
          cityConfigId: quitoCity._id.toString(),
          cityName: quitoCity.city,
          country: quitoCity.country || "Ecuador",
          province: quitoCity.province || "Pichincha",
          sector: quitoCity.sector || "Norte",
          neighborhood: quitoCity.neighborhood || "Centro",
          position: String(ad.position || 1),
          durationDays: "7",
          merchantTransactionId: invNum,
        },
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.collection("advertisements").updateOne(
        { _id: ad._id },
        { $set: { transactionId: insertAdTx.insertedId } }
      );
      console.log(`   ✔ Created Advertisement Transaction for ${email}`);
    }

    // Update user properties
    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          hasSellerAccount: true,
          subscriptionStatus: "active",
          subscriptionPackageId: storePackage._id,
          subscriptionExpiresAt: oneYearFromNow,
        },
      }
    );
  }

  // 6. Summary check
  const finalTxCount = await db.collection("transactions").countDocuments({});
  const finalSubCount = await db.collection("subscriptions").countDocuments({});
  const finalAdCount = await db.collection("advertisements").countDocuments({});
  console.log("\n==========================================");
  console.log("SYNC COMPLETE!");
  console.log(`Total Transactions: ${finalTxCount}`);
  console.log(`Total Subscriptions: ${finalSubCount}`);
  console.log(`Total Advertisements: ${finalAdCount}`);
  console.log("==========================================");

  await mongoose.disconnect();
}

syncAllTransactions().catch(console.error);
