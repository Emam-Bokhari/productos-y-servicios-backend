import axios from "axios";
import config from "../src/config";

async function check() {
  const checkoutId = "0DFC452780B6500B1597BE2F00F8D427.uat01-vm-tx01";
  const url = `${config.datafast.baseUrl}/v1/checkouts/${checkoutId}/payment?entityId=${config.datafast.entityId}`;
  console.log("Checking URL:", url);
  console.log("Bearer Token:", config.datafast.bearerToken);
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${config.datafast.bearerToken}`,
      },
    });
    console.log("Response:", JSON.stringify(response.data, null, 2));
  } catch (err: any) {
    console.error("HTTP Error:", err.response?.status, err.response?.data);
  }
}
check();
