import axios from "axios";

async function testEu() {
  const checkoutId = "4E14AA81469CEA92A5AF591B4168C5C4.uat01-vm-tx01";
  const entityId = "8a8294185a65bf5e015a6c8b89a10d8d";
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";

  const urls = [
    `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${entityId}`,
    `https://test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${entityId}`,
  ];

  for (const url of urls) {
    console.log("Checking URL:", url);
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log("Response:", res.status, res.data.result);
    } catch (err: any) {
      console.log("Error:", err.response?.status, err.response?.data?.result);
    }
  }
}

testEu();
