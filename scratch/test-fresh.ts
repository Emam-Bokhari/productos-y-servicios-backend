import axios from "axios";
import config from "../src/config";

async function testFresh() {
  console.log("1. Creating checkout...");
  const createUrl = `${config.datafast.baseUrl}/v1/checkouts`;
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

  const createRes = await axios.post(createUrl, params.toString(), {
    headers: {
      Authorization: `Bearer ${config.datafast.bearerToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const checkoutId = createRes.data.id;
  console.log("Checkout ID:", checkoutId);

  console.log("2. Querying status immediately with entityId...");
  const statusUrl = `${config.datafast.baseUrl}/v1/checkouts/${checkoutId}/payment?entityId=${config.datafast.entityId}`;
  try {
    const statusRes = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${config.datafast.bearerToken}`,
      },
    });
    console.log("Status with entityId:", statusRes.data.result);
  } catch (err: any) {
    console.log("Status with entityId Error:", err.response?.data?.result || err.message);
  }

  console.log("3. Querying status without entityId query param...");
  const statusUrl2 = `${config.datafast.baseUrl}/v1/checkouts/${checkoutId}/payment`;
  try {
    const statusRes2 = await axios.get(statusUrl2, {
      headers: {
        Authorization: `Bearer ${config.datafast.bearerToken}`,
      },
    });
    console.log("Status without entityId:", statusRes2.data.result);
  } catch (err: any) {
    console.log("Status without entityId Error:", err.response?.data?.result || err.message);
  }
}

testFresh();
