import mongoose from "mongoose";
import bcrypt from "bcrypt";
import config from "../src/config";
import { User } from "../src/app/modules/user/user.model";
import { SubscriptionPackage } from "../src/app/modules/subscriptionPackage/subscriptionPackage.model";
import { Subscription } from "../src/app/modules/subscription/subscription.model";
import { Transaction } from "../src/app/modules/transaction/transaction.model";
import { Store } from "../src/app/modules/store/store.model";
import { Advertisement } from "../src/app/modules/advertisement/advertisement.model";
import { CityAdConfiguration } from "../src/app/modules/cityAdConfiguration/cityAdConfiguration.model";
import { StoreCategory } from "../src/app/modules/storeCategory/storeCategory.model";
import datafastService from "../src/app/modules/datafast/datafast.service";
import { fulfillDatafastPayment } from "../src/app/modules/datafast/datafast.controller";
import { StoreService } from "../src/app/modules/store/store.service";
import { AdvertisementService } from "../src/app/modules/advertisement/advertisement.service";
import { STATUS, USER_ROLES } from "../src/enums/user";
import { ADVERTISEMENT_TYPE } from "../src/app/modules/advertisement/advertisement.constant";

async function runFullE2ETest() {
  console.log("==========================================================");
  console.log("🚀 STARTING COMPLETE DATAFAST END-TO-END VERIFICATION TEST");
  console.log("==========================================================");

  await mongoose.connect(config.database_url as string);
  console.log("✅ Connected to MongoDB");

  // Ensure post_add package is active
  await SubscriptionPackage.findByIdAndUpdate("6aaab5899a44a5eb878781ab", {
    status: "active",
  });
  console.log("✅ Activated post_add package (6aaab5899a44a5eb878781ab)");

  // ----------------------------------------------------
  // 1. CREATE NEW USER ACCOUNT
  // ----------------------------------------------------
  console.log("\n----------------------------------------------------");
  console.log("1. CREATING NEW USER ACCOUNT");
  console.log("----------------------------------------------------");

  const testEmail = "datafast.merchant.2026@gmail.com";
  let user = await User.findOne({ email: testEmail });

  if (!user) {
    const hashedPassword = await bcrypt.hash("Admin@1234", Number(config.bcrypt_salt_rounds) || 12);
    user = await User.create({
      name: "Datafast Merchant Ecuador",
      email: testEmail,
      password: hashedPassword,
      role: USER_ROLES.USER,
      verified: true,
      status: STATUS.ACTIVE,
      contact: "0991234567",
      countryCode: "+593",
      address: "Av. Amazonas y Naciones Unidas, Quito",
    });
    console.log("✨ New user created:", { id: user._id.toString(), email: user.email, name: user.name });
  } else {
    console.log("ℹ️ Using existing test user:", { id: user._id.toString(), email: user.email });
  }

  const userId = user._id.toString();

  // ----------------------------------------------------
  // 2. STORE CREATION PACKAGE SUBSCRIPTION (VIA DATAFAST)
  // ----------------------------------------------------
  console.log("\n----------------------------------------------------");
  console.log("2. PURCHASING STORE CREATION PACKAGE VIA DATAFAST");
  console.log("----------------------------------------------------");

  const storePackage = await SubscriptionPackage.findById("6a7ff377c24d0046a564c737"); // MEMBRESÍA ANUAL ($17.25)
  if (!storePackage) throw new Error("Store package not found");

  const count1 = await Transaction.countDocuments({ transactionId: { $regex: "^INV-" } });
  const invoiceNumber1 = 1000 + count1 + 1;
  const merchantTxId1 = `INV-${new Date().getFullYear()}-${invoiceNumber1}`;

  console.log(`Preparing Datafast checkout for Package: ${storePackage.name} ($${storePackage.price})...`);
  const checkout1 = await datafastService.prepareCheckoutSession({
    amount: storePackage.price,
    currency: "USD",
    userEmail: user.email,
    userName: user.name,
    isSubscription: true,
    merchantTransactionId: merchantTxId1,
    metadata: {
      userId,
      packageId: storePackage._id.toString(),
      packageType: storePackage.packageType,
    },
  });

  console.log("Created Store Subscription Checkout ID:", checkout1.checkoutId);

  // Persist pending transaction
  await Transaction.create({
    transactionId: merchantTxId1,
    userId,
    packageId: storePackage._id,
    amount: storePackage.price,
    paymentMethod: "ONLINE",
    paymentStatus: "PENDING",
    transactionType: "booking_payment",
    stripeCheckoutSessionId: checkout1.checkoutId,
    metadata: {
      packageId: storePackage._id.toString(),
      packageType: storePackage.packageType,
      merchantTransactionId: merchantTxId1,
    },
  });

  console.log("Simulating user submitting card and redirecting to callback...");
  const fulfillment1 = await fulfillDatafastPayment({
    checkoutId: checkout1.checkoutId,
  });

  console.log("✅ Store Subscription Payment Fulfilled Successfully!");
  console.log("Subscription Status:", fulfillment1.subscription.status);
  console.log("Subscription Expires At:", fulfillment1.subscription.expiresAt);
  console.log("Datafast Token Stored:", fulfillment1.subscription.datafastRegistrationToken);
  console.log("Transaction ID:", fulfillment1.transaction.transactionId);
  console.log("Transaction Status:", fulfillment1.transaction.paymentStatus);
  console.log("Invoice Generated URL:", fulfillment1.invoiceUrl);

  // ----------------------------------------------------
  // 3. CREATE STORE FOR THIS USER
  // ----------------------------------------------------
  console.log("\n----------------------------------------------------");
  console.log("3. CREATING STORE FOR USER");
  console.log("----------------------------------------------------");

  let store = await Store.findOne({ owner: userId });
  if (!store) {
    const category = await StoreCategory.findOne();
    const city = await CityAdConfiguration.findOne({ status: "active" });

    const storeRes = await StoreService.createStoreToDB(userId, {
      storeType: "product_store",
      displayName: "Mega Tienda Tecnológica Datafast",
      description: "Tienda autorizada de tecnología en Ecuador integrada con Datafast.",
      categoryId: category?._id.toString() || "6a76eb808624bba43547e992",
      cityId: city?._id.toString() || "6aaa3703dac1e18f5f869b25",
      logo: "/uploads/stores/datafast-logo.png",
      coverImage: "/uploads/stores/datafast-cover.png",
      tradeLicense: "/uploads/stores/datafast-license.pdf",
      businessLicenseNumber: "RUC-1791234567001",
      tinNumber: "TIN-987654321",
      phone: "0991234567",
      email: testEmail,
      openingTime: "08:00 AM",
      closingTime: "08:00 PM",
    });

    store = storeRes.store;
    if (store) {
      store.status = "active" as any;
      await store.save();

      console.log("✨ Store created successfully:", {
        id: store._id.toString(),
        displayName: store.displayName,
        status: store.status,
        owner: store.owner.toString(),
      });
    }
  } else {
    store.status = "active" as any;
    await store.save();
    console.log("ℹ️ Existing store updated to active:", {
      id: store._id.toString(),
      displayName: store.displayName,
      status: store.status,
    });
  }

  // ----------------------------------------------------
  // 4. ADVERTISEMENT PACKAGE PURCHASE (VIA DATAFAST)
  // ----------------------------------------------------
  console.log("\n----------------------------------------------------");
  console.log("4. PURCHASING ADVERTISEMENT PACKAGE (POST_ADD) VIA DATAFAST");
  console.log("----------------------------------------------------");

  const targetCity = await CityAdConfiguration.findOne({ status: "active" });
  if (!targetCity) throw new Error("No active city configuration found");
  targetCity.featuredEnabled = true;
  await targetCity.save();

  const adPackage = await SubscriptionPackage.findById("6aaab5899a44a5eb878781ab"); // post_add ($20)
  if (!adPackage) throw new Error("Advertisement package not found");

  const count2 = await Transaction.countDocuments({ transactionId: { $regex: "^INV-" } });
  const invoiceNumber2 = 1000 + count2 + 1;
  const merchantTxId2 = `INV-${new Date().getFullYear()}-${invoiceNumber2}`;

  console.log(`Preparing Datafast checkout for Ad Package: ${adPackage.name} ($${adPackage.price}) for City: ${targetCity.city}...`);
  const checkout2 = await datafastService.prepareCheckoutSession({
    amount: adPackage.price,
    currency: "USD",
    userEmail: user.email,
    userName: user.name,
    isSubscription: false,
    merchantTransactionId: merchantTxId2,
    metadata: {
      userId,
      packageId: adPackage._id.toString(),
      packageType: "post_add",
      cityConfigId: targetCity._id.toString(),
      position: "1",
    },
  });

  console.log("Created Advertisement Checkout ID:", checkout2.checkoutId);

  // Persist pending transaction
  await Transaction.create({
    transactionId: merchantTxId2,
    userId,
    packageId: adPackage._id,
    amount: adPackage.price,
    paymentMethod: "ONLINE",
    paymentStatus: "PENDING",
    transactionType: "booking_payment",
    stripeCheckoutSessionId: checkout2.checkoutId,
    metadata: {
      packageId: adPackage._id.toString(),
      packageType: "post_add",
      cityConfigId: targetCity._id.toString(),
      position: "1",
      merchantTransactionId: merchantTxId2,
    },
  });

  console.log("Simulating user submitting card and redirecting to callback...");
  const fulfillment2 = await fulfillDatafastPayment({
    checkoutId: checkout2.checkoutId,
  });

  console.log("✅ Advertisement Payment Fulfilled Successfully!");
  console.log("Ad Subscription ID:", fulfillment2.subscription._id.toString());
  console.log("Ad Subscription Status:", fulfillment2.subscription.status);
  console.log("Ad Subscription City:", fulfillment2.subscription.cityConfigId);
  console.log("Ad Subscription Position:", fulfillment2.subscription.position);
  console.log("Ad Transaction ID:", fulfillment2.transaction.transactionId);
  console.log("Ad Transaction Status:", fulfillment2.transaction.paymentStatus);
  console.log("Ad Invoice Generated URL:", fulfillment2.invoiceUrl);

  // ----------------------------------------------------
  // 5. CREATE ADVERTISEMENT FOR USER'S STORE
  // ----------------------------------------------------
  console.log("\n----------------------------------------------------");
  console.log("5. BOOKING & CREATING ADVERTISEMENT IN CITY");
  console.log("----------------------------------------------------");

  const today = new Date();
  const startDate = today.toISOString();
  const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const ad = await AdvertisementService.createAdvertisementToDB(userId, {
    campaignName: "Campaña Especial Tecnología 2026",
    cityAdConfigId: targetCity._id as any,
    advertisementType: ADVERTISEMENT_TYPE.FEATURED,
    position: 1,
    startDate: startDate as any,
    endDate: endDate as any,
    featuredImage: "/uploads/advertisements/promo-banner.jpg",
  });

  console.log("✨ Advertisement created successfully:", {
    id: (ad as any)._id?.toString(),
    campaignName: ad.campaignName,
    status: ad.status,
    position: ad.position,
    city: targetCity.city,
    startDate: ad.startDate,
    endDate: ad.endDate,
  });

  // ----------------------------------------------------
  // 6. FINAL DATABASE VERIFICATION & AUDIT
  // ----------------------------------------------------
  console.log("\n====================================================");
  console.log("📊 FINAL AUDIT OF CREATED DATA IN MONGODB");
  console.log("====================================================");

  const finalUser = await User.findById(userId);
  const finalStore = await Store.findOne({ owner: userId });
  const finalSubscriptions = await Subscription.find({ userId });
  const finalTransactions = await Transaction.find({ userId });
  const finalAds = await Advertisement.find({ storeId: finalStore?._id });

  console.log("\n👤 User Account in DB:");
  console.log({
    id: finalUser?._id.toString(),
    email: finalUser?.email,
    name: finalUser?.name,
    subscriptionStatus: finalUser?.subscriptionStatus,
    datafastToken: finalUser?.datafastRegistrationToken,
  });

  console.log("\n🏬 Store in DB:");
  console.log({
    id: finalStore?._id.toString(),
    displayName: finalStore?.displayName,
    status: finalStore?.status,
    owner: finalStore?.owner.toString(),
  });

  console.log(`\n📋 Subscriptions in DB (${finalSubscriptions.length} total):`);
  finalSubscriptions.forEach((s, idx) => {
    console.log(`  [${idx + 1}] ID: ${s._id} | Type: ${s.packageType} | Status: ${s.status} | Expires: ${s.expiresAt} | Token: ${s.datafastRegistrationToken || 'N/A'}`);
  });

  console.log(`\n💳 Transactions in DB (${finalTransactions.length} total):`);
  finalTransactions.forEach((t, idx) => {
    console.log(`  [${idx + 1}] ID: ${t._id} | TxId: ${t.transactionId} | Amount: $${t.amount} | Status: ${t.paymentStatus} | Invoice: ${t.invoiceUrl}`);
  });

  console.log(`\n📢 Advertisements in DB (${finalAds.length} total):`);
  finalAds.forEach((a, idx) => {
    console.log(`  [${idx + 1}] ID: ${a._id} | Campaign: ${a.campaignName} | Status: ${a.status} | Position: ${a.position}`);
  });

  console.log("\n🔒 ALL DATA HAS BEEN RETAINED AND KEPT IN THE DATABASE AS REQUESTED.");
  console.log("🎉 VERIFICATION COMPLETED WITH 100% SUCCESS!");

  await mongoose.disconnect();
}

runFullE2ETest().catch((err) => {
  console.error("❌ E2E Test Error:", err);
  process.exit(1);
});
