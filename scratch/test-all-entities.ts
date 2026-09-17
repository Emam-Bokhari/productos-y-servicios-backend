import axios from "axios";

async function testAllEntities() {
  const checkoutId = "82E2E86539A0BFDA7A3EB5AFB1ECCD62.uat01-vm-tx01";
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";

  const entityIds = [
    "8a829418533cf31d01533d06f2ee06fa", // Doc 3 Page 12
    "8a8294185a65bf5e015a6c8b89a10d8d", // Doc 2 / .env
    "8a8294174b7ecb28014b9699220015ca", // Doc 3 Page 52/58
    "8a829418533cf31d01533d06fd040748", // User ID in decoded token
    "1000000505",
    "1000000406",
    "PD100406",
  ];

  for (const eid of entityIds) {
    console.log(`\nTesting status with entityId: ${eid}`);
    try {
      const res = await axios.get(
        `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${eid}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`SUCCESS with ${eid}!`, res.data.result);
      console.log("Full data:", JSON.stringify(res.data, null, 2));
      return;
    } catch (err: any) {
      console.log(`Failed with ${eid}:`, err.response?.status, err.response?.data?.result || err.message);
    }
  }
}

testAllEntities();
