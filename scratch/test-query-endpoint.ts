import axios from "axios";

async function testQueryEndpoint() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entityId = "8a8294185a65bf5e015a6c8b89a10d8d";
  const checkoutId = "4E14AA81469CEA92A5AF591B4168C5C4.uat01-vm-tx01";

  console.log("--- 1. Testing /v1/query/{id} ---");
  try {
    const res1 = await axios.get(`https://eu-test.oppwa.com/v1/query/${checkoutId}?entityId=${entityId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Res1:", res1.status, res1.data);
  } catch (e: any) {
    console.log("Err1:", e.response?.status, e.response?.data);
  }

  console.log("\n--- 2. Testing /v1/query?checkoutId=... ---");
  try {
    const res2 = await axios.get(`https://eu-test.oppwa.com/v1/query?entityId=${entityId}&checkoutId=${checkoutId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Res2:", res2.status, res2.data);
  } catch (e: any) {
    console.log("Err2:", e.response?.status, e.response?.data);
  }
}

testQueryEndpoint();
