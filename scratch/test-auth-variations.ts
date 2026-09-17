import axios from "axios";

async function testAuthVariations() {
  const checkoutId = "82E2E86539A0BFDA7A3EB5AFB1ECCD62.uat01-vm-tx01";
  const entityId = "8a829418533cf31d01533d06f2ee06fa";
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";

  const variations = [
    { name: "With Bearer + entityId query", headers: { Authorization: `Bearer ${token}` }, params: { entityId } },
    { name: "With Bearer only (no entityId param)", headers: { Authorization: `Bearer ${token}` }, params: {} },
    { name: "No Bearer + entityId query", headers: {}, params: { entityId } },
    { name: "Decoded Basic Auth (userId:pwd)", headers: { Authorization: `Basic ` + Buffer.from("8a829418533cf31d01533d06fd040748:Xt7F22QENX").toString("base64") }, params: { entityId } },
    { name: "Decoded query params (userId/password)", headers: {}, params: { entityId, "authentication.userId": "8a829418533cf31d01533d06fd040748", "authentication.password": "Xt7F22QENX" } },
  ];

  for (const v of variations) {
    console.log(`\n--- Testing ${v.name} ---`);
    try {
      const res = await axios.get(`https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment`, {
        headers: v.headers,
        params: v.params
      });
      console.log("SUCCESS!", res.status, res.data);
      return;
    } catch (err: any) {
      console.log("Failed:", err.response?.status, err.response?.data?.result || err.message);
    }
  }
}

testAuthVariations();
