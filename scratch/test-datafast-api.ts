import axios from "axios";
import config from "../src/config";

async function testDatafast() {
  console.log("Testing Datafast prepareCheckoutSession...");

  const url = `${config.datafast.baseUrl}/v1/checkouts`;
  const params = new URLSearchParams();

  const amount = 1.12;
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
  params.append("merchantTransactionId", `TEST-${Date.now()}`);

  params.append("customer.email", "testuser@example.com");
  params.append("customer.givenName", "Test User");

  params.append("createRegistration", "true");
  params.append("recurringType", "INITIAL");
  params.append("risk.parameters[USER_DATA1]", "INITIAL");
  params.append("risk.parameters[USER_DATA2]", "PagoRapidoDF");
  params.append("testMode", "EXTERNAL");

  try {
    const res = await axios.post(url, params.toString(), {
      headers: {
        Authorization: `Bearer ${config.datafast.bearerToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("Checkout Created:", res.data.id);
    const checkoutId = res.data.id;

    // Now query payment status
    const statusUrl = `${config.datafast.baseUrl}/v1/checkouts/${checkoutId}/payment?entityId=${config.datafast.entityId}`;
    try {
      const statusRes = await axios.get(statusUrl, {
        headers: {
          Authorization: `Bearer ${config.datafast.bearerToken}`,
        },
      });
      console.log("Status Res:", statusRes.data);
    } catch (err: any) {
      console.log("Status Error (Expected before payment):", err.response?.data?.result || err.message);
    }
  } catch (error: any) {
    console.error("Datafast Error:", error.response?.data || error.message);
  }
}

testDatafast();
