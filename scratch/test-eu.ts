import axios from "axios";
import config from "../src/config";

async function testEu() {
  const checkoutId = "A092D24CC57544600BB56FDB2BCF271D.uat01-vm-tx01";
  const urls = [
    `https://test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${config.datafast.entityId}`,
    `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${config.datafast.entityId}`,
  ];

  for (const u of urls) {
    try {
      const res = await axios.get(u, {
        headers: { Authorization: `Bearer ${config.datafast.bearerToken}` },
      });
      console.log("SUCCESS on", u, res.data);
    } catch (e: any) {
      console.log("FAILED on", u, e.response?.status, e.response?.data?.result);
    }
  }
}
testEu();
