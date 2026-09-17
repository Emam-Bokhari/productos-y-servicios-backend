import axios from "axios";
import config from "../src/config";

async function testQuery() {
  const checkoutId = "A092D24CC57544600BB56FDB2BCF271D.uat01-vm-tx01";
  const entityIds = [
    config.datafast.entityId, // 8a8294185a65bf5e015a6c8b89a10d8d
    "8a829418533cf31d01533d06fd040748", // userId from decoded bearer token
    config.datafast.recurringEntityId,
    config.datafast.mid,
  ];

  for (const eid of entityIds) {
    console.log("\n--- Testing with entityId:", eid, "---");
    const url = `${config.datafast.baseUrl}/v1/checkouts/${checkoutId}/payment?entityId=${eid}`;
    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${config.datafast.bearerToken}`,
        },
      });
      console.log("SUCCESS! Response:", res.data);
    } catch (err: any) {
      console.log("Failed:", err.response?.status, err.response?.data?.result);
    }
  }
}

testQuery();
