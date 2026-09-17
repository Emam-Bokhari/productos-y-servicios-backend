import axios from "axios";
import config from "../src/config";

async function check() {
  const checkoutId = "4E14AA81469CEA92A5AF591B4168C5C4.uat01-vm-tx01";
  const url = `${config.datafast.baseUrl}/v1/checkouts/${checkoutId}/payment?entityId=${config.datafast.entityId}`;
  console.log("Querying:", url);
  console.log("Using entityId:", config.datafast.entityId);
  console.log("Using bearerToken:", config.datafast.bearerToken);
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${config.datafast.bearerToken}` }
    });
    console.log("Payment Data:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.log("Error HTTP Status:", err.response?.status);
    console.log("Error Data:", JSON.stringify(err.response?.data, null, 2));
  }
}
check();
