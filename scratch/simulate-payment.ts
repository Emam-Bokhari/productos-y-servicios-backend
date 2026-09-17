import axios from "axios";
import config from "../src/config";
import datafastService from "../src/app/modules/datafast/datafast.service";

async function simulateWidgetPaymentSubmission() {
  console.log("--- 1. Creating Checkout Session ---");
  const checkoutUrl = `${config.datafast.baseUrl}/v1/checkouts`;
  const params = new URLSearchParams();

  const amount = 17.25;
  params.append("entityId", config.datafast.entityId);
  params.append("amount", amount.toFixed(2));
  params.append("currency", "USD");
  params.append("paymentType", "DB");

  params.append("customParameters[SHOPPER_MID]", config.datafast.mid);
  params.append("customParameters[SHOPPER_TID]", config.datafast.tid);
  params.append("customParameters[SHOPPER_ECI]", config.datafast.eci);
  params.append("customParameters[SHOPPER_PSERV]", config.datafast.pserv);
  params.append("customParameters[SHOPPER_VAL_BASE0]", amount.toFixed(2));
  params.append("customParameters[SHOPPER_VAL_BASEIMP]", "0.00");
  params.append("customParameters[SHOPPER_VAL_IVA]", "0.00");
  params.append("customParameters[SHOPPER_VERSIONDF]", "2");
  params.append("merchantTransactionId", `TEST-E2E-${Date.now()}`);

  params.append("customer.email", "studentemam@gmail.com");
  params.append("customer.givenName", "Moshfiqur Rahman");

  params.append("createRegistration", "true");
  params.append("recurringType", "INITIAL");
  params.append("risk.parameters[USER_DATA1]", "INITIAL");
  params.append("risk.parameters[USER_DATA2]", "PagoRapidoDF");
  params.append("testMode", "EXTERNAL");

  // Metadata for subscription activation
  params.append("customParameters[SHOPPER_PKG_ID]", "6a7ff377c24d0046a564c737");
  params.append("customParameters[SHOPPER_USER_ID]", "6a76edddda03657909bcbd43");

  const checkoutRes = await axios.post(checkoutUrl, params.toString(), {
    headers: {
      Authorization: `Bearer ${config.datafast.bearerToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const checkoutId = checkoutRes.data.id;
  console.log("Created Checkout ID:", checkoutId);

  console.log("\n--- 2. Simulating COPYandPAY Form Submission directly to Oppwa Gateway ---");
  const payUrl = `${config.datafast.baseUrl}/v1/checkouts/${checkoutId}/payment`;
  const cardData = new URLSearchParams();
  cardData.append("paymentBrand", "VISA");
  cardData.append("card.number", "4200000000000000");
  cardData.append("card.holder", "Su Empresa");
  cardData.append("card.expiryMonth", "12");
  cardData.append("card.expiryYear", "2028");
  cardData.append("card.cvv", "123");
  cardData.append("shopperResultUrl", `https://api.jaganaecuador.com/api/v1/datafast/callback?checkoutId=${checkoutId}`);

  try {
    const payRes = await axios.post(payUrl, cardData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("Oppwa Payment Status HTTP:", payRes.status);
    console.log("Oppwa Payment Result Code:", payRes.data.result?.code);
    console.log("Oppwa Payment Result Description:", payRes.data.result?.description);
    console.log("Oppwa Registration Token (Tokenization):", payRes.data.registrationId);
    console.log("Oppwa Transaction ID:", payRes.data.id);
    console.log("Oppwa Redirect:", payRes.data.redirect);

    console.log("\n--- 3. Calling our Backend Callback to Verify Fulfillment ---");
    const callbackRes = await axios.get(`https://api.jaganaecuador.com/api/v1/datafast/callback?checkoutId=${checkoutId}`);
    console.log("Backend Callback Status:", callbackRes.status);
    console.log("Backend Callback Returned HTML contains 'Payment Successful':", callbackRes.data.includes("Payment Successful") || callbackRes.data.includes("exitosamente"));

    // Check if Subscription and Transaction were created in DB
    console.log("\n--- 4. Checking Database for Subscription & Transaction ---");
    const mongoose = require("mongoose");
    await mongoose.connect(config.database_url);
    const { Subscription } = require("../src/app/modules/subscription/subscription.model");
    const { Transaction } = require("../src/app/modules/transaction/transaction.model");
    const { User } = require("../src/app/modules/user/user.model");

    const sub = await Subscription.findOne({ userId: "6a76edddda03657909bcbd43", packageType: "store_creation" });
    const tx = await Transaction.findOne({ stripeCheckoutSessionId: checkoutId });
    const user = await User.findById("6a76edddda03657909bcbd43");

    console.log("Subscription in DB:", {
      status: sub?.status,
      packageId: sub?.packageId,
      expiresAt: sub?.expiresAt,
      token: sub?.datafastRegistrationToken,
      invoiceNumber: sub?.invoiceNumber,
      invoiceUrl: sub?.invoiceUrl,
    });

    console.log("Transaction in DB:", {
      transactionId: tx?.transactionId,
      amount: tx?.amount,
      status: tx?.paymentStatus,
      paymentMethod: tx?.paymentMethod,
      gatewayTxId: tx?.gatewayTransactionId,
      invoiceUrl: tx?.invoiceUrl,
    });

    console.log("User in DB:", {
      subscriptionStatus: user?.subscriptionStatus,
      datafastRegistrationToken: user?.datafastRegistrationToken,
      subscriptionExpiresAt: user?.subscriptionExpiresAt,
    });

    console.log("\n--- 5. Testing Automated Recurring Renewal (Cron simulation) ---");
    console.log("Using token:", sub?.datafastRegistrationToken);
    if (sub?.datafastRegistrationToken) {
      const recurringRes = await datafastService.executeRecurringPayment(
        sub.datafastRegistrationToken,
        17.25,
        sub._id.toString()
      );
      console.log("Recurring Payment Result Code:", recurringRes.result?.code);
      console.log("Recurring Payment Description:", recurringRes.result?.description);
      console.log("Recurring Payment ID:", recurringRes.id);
      console.log("Recurring Payment SUCCESS?:", datafastService.isSuccessCode(recurringRes.result?.code));
    }

    await mongoose.disconnect();
  } catch (err: any) {
    console.error("Payment Submission Error Details:", JSON.stringify(err.response?.data, null, 2) || err.message);
  }
}

simulateWidgetPaymentSubmission();
