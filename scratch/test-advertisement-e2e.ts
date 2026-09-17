import mongoose from "mongoose";
import config from "../src/config";
import { User } from "../src/app/modules/user/user.model";
import { Store } from "../src/app/modules/store/store.model";
import { CityAdConfiguration } from "../src/app/modules/cityAdConfiguration/cityAdConfiguration.model";
import { Transaction } from "../src/app/modules/transaction/transaction.model";
import { Subscription } from "../src/app/modules/subscription/subscription.model";
import { Advertisement } from "../src/app/modules/advertisement/advertisement.model";
import { fulfillDatafastPayment } from "../src/app/modules/datafast/datafast.controller";
import { AdvertisementService } from "../src/app/modules/advertisement/advertisement.service";
import { invoiceService } from "../src/app/modules/invoice/invoice.service";

async function runEndToEndVerification() {
  await mongoose.connect(config.database_url as string);
  console.log("=== Connected to MongoDB ===");

  try {
    // 1. Find the test merchant
    const user = await User.findOne({ email: "datafast.merchant.2026@gmail.com" });
    if (!user) throw new Error("Test user not found!");
    console.log(`1. Test user found: ${user.name} (${user._id})`);

    // 2. Find the store
    const store = await Store.findOne({ owner: user._id });
    if (!store) throw new Error("Store not found for user!");
    console.log(`2. Test store found: ${(store as any).name || store._id} (${store._id}), status: ${store.status}`);

    // 3. Find City Configuration
    const cityConfig = await CityAdConfiguration.findOne({
      _id: "6aaa3703dac1e18f5f869b25",
    });
    if (!cityConfig) throw new Error("CityAdConfiguration not found!");
    console.log(
      `3. City found: ${cityConfig.city} (${cityConfig._id}), featuredCapacity: ${cityConfig.featuredCapacity}`,
    );
    console.log("   Position pricing:", JSON.stringify(cityConfig.featuredPositionPricing));

    const testPosition = 3;
    const pricingObj = (cityConfig.featuredPositionPricing || []).find(
      (p: any) => p.position === testPosition,
    );
    const expectedPrice = pricingObj ? pricingObj.price : 100;
    console.log(`   Selected Position ${testPosition} price: $${expectedPrice}`);

    // 4. Test Checkout Session Simulation
    const testCheckoutId = `DF-TEST-CHECKOUT-${Date.now()}`;
    const merchantTxId = `INV-2026-TEST-${Math.floor(1000 + Math.random() * 9000)}`;

    console.log(`4. Simulating Pending Transaction: ${merchantTxId}`);
    const pendingTx = await Transaction.create({
      transactionId: merchantTxId,
      userId: user._id,
      amount: expectedPrice,
      currency: "USD",
      paymentMethod: "ONLINE",
      paymentStatus: "PENDING",
      transactionType: "advertisement_payment",
      checkoutSessionId: testCheckoutId,
      metadata: {
        bookingType: "advertisement",
        cityConfigId: cityConfig._id.toString(),
        position: testPosition,
        cityName: cityConfig.city,
        merchantTransactionId: merchantTxId,
      },
    });
    console.log(`   Pending transaction created: ${pendingTx._id}`);

    // 5. Test Fulfill Payment
    console.log("5. Testing fulfillDatafastPayment...");
    const initialSubCount = await Subscription.countDocuments({ userId: user._id });

    const fulfillmentResult = await fulfillDatafastPayment({
      checkoutId: testCheckoutId,
      cityConfigId: cityConfig._id.toString(),
      position: testPosition,
      userId: user._id.toString(),
    });

    console.log("   Payment fulfilled successfully!");
    console.log(`   Invoice Number: ${fulfillmentResult.invoiceNumber}`);
    console.log(`   Amount Paid: $${fulfillmentResult.amountPaid}`);
    console.log(`   Transaction Status: ${fulfillmentResult.transaction.paymentStatus}`);

    // Verify NO Subscription was created
    const finalSubCount = await Subscription.countDocuments({ userId: user._id });
    if (finalSubCount !== initialSubCount) {
      throw new Error(`FAILURE: A Subscription was created! Count went from ${initialSubCount} to ${finalSubCount}`);
    }
    console.log(`   ✔ Verified: No Subscription document was created (Sub count remained ${finalSubCount})`);

    // 6. Test Advertisement Creation in DB
    console.log("6. Testing advertisement booking in DB...");
    const campaignName = `E2E Campaign Pos ${testPosition} - ${Date.now()}`;
    const newAd = await AdvertisementService.createAdvertisementToDB(user._id.toString(), {
      cityAdConfigId: cityConfig._id,
      advertisementType: "featured" as any,
      campaignName,
      position: testPosition,
      startDate: new Date(),
      featuredImage: "https://example.com/banner.jpg",
    });

    console.log("   ✔ Advertisement created successfully!");
    console.log(`   Ad ID: ${(newAd as any)._id}`);
    console.log(`   Campaign Name: ${newAd.campaignName}`);
    console.log(`   Status: ${newAd.status}`);
    console.log(`   Position: ${newAd.position}`);
    console.log(`   Price charged: $${newAd.price}`);
    console.log(`   Dates: ${newAd.startDate.toISOString()} to ${newAd.endDate.toISOString()}`);
    console.log(`   Linked Transaction: ${newAd.transactionId}`);

    if (newAd.price !== expectedPrice) {
      throw new Error(`FAILURE: Ad price was $${newAd.price}, expected $${expectedPrice}`);
    }
    console.log(`   ✔ Verified: Price matches Position ${testPosition} pricing ($${expectedPrice})`);

    // 7. Test Invoice Generation
    console.log("7. Testing Invoice Data & PDF...");
    const invoiceData = await invoiceService.buildInvoiceData(fulfillmentResult.invoiceNumber);
    console.log(`   Invoice Number: ${invoiceData.invoiceNumber}`);
    console.log(`   Invoice Amount: $${invoiceData.total}`);
    console.log(`   Line Items:`, JSON.stringify(invoiceData.items, null, 2));

    const pdfResult = await invoiceService.generateInvoicePdf(invoiceData);
    console.log(`   ✔ PDF generated successfully: ${pdfResult.filename}`);
    console.log(`   File size: ${pdfResult.buffer ? pdfResult.buffer.length : 0} bytes`);

    console.log("\n=========================================");
    console.log("   ALL VERIFICATIONS PASSED SUCCESSFULLY!");
    console.log("=========================================");
  } catch (error) {
    console.error("Test Error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runEndToEndVerification();
