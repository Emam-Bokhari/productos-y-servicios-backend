import axios from "axios";
import config from "../src/config";
import datafastService from "../src/app/modules/datafast/datafast.service";

async function testTokenAndRecurring() {
  console.log("=== Testing Stand-Alone Tokenization ===");
  const regUrl = `${config.datafast.baseUrl}/v1/registrations`;
  const params = new URLSearchParams();

  params.append("entityId", config.datafast.entityId);
  params.append("paymentBrand", "VISA");
  params.append("card.number", "4111111111111111");
  params.append("card.holder", "Moshfiqur Rahman");
  params.append("card.expiryMonth", "12");
  params.append("card.expiryYear", "2028");
  params.append("card.cvv", "123");

  try {
    const regRes = await axios.post(regUrl, params.toString(), {
      headers: {
        Authorization: `Bearer ${config.datafast.bearerToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("Registration Response Status:", regRes.status);
    console.log("Registration Result Code:", regRes.data.result?.code);
    console.log("Registration Description:", regRes.data.result?.description);
    const token = regRes.data.id;
    console.log("GENERATED TOKEN (registrationId):", token);

    if (token) {
      console.log("\n=== Testing Recurring Payment with Generated Token ===");
      console.log("Calling executeRecurringPayment with Token:", token);
      const trxId = `REC-${Date.now()}`;
      const recRes = await datafastService.executeRecurringPayment(
        token,
        1.12, // exactly as in user's prompt example ($1.12)
        trxId
      );

      console.log("Recurring Payment HTTP Response Data:", JSON.stringify(recRes, null, 2));
      console.log("Is Recurring Success?:", datafastService.isSuccessCode(recRes.result?.code));
    }
  } catch (err: any) {
    console.error("Error:", JSON.stringify(err.response?.data, null, 2) || err.message);
  }
}

testTokenAndRecurring();
