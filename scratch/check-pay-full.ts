import axios from "axios";

async function run() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entityId = "8a829418533cf31d01533d06f2ee06fa";
  const c = await axios.post(
    "https://eu-test.oppwa.com/v1/checkouts",
    new URLSearchParams({ entityId, amount: "1.00", currency: "USD", paymentType: "DB" }),
    { headers: { Authorization: "Bearer " + token } }
  );
  const cid = c.data.id;
  console.log("Checkout created:", cid);
  try {
    const p = await axios.post(
      "https://eu-test.oppwa.com/v1/checkouts/" + cid + "/payment",
      new URLSearchParams({
        paymentBrand: "VISA",
        "card.number": "4540630000000000",
        "card.holder": "Test",
        "card.expiryMonth": "04",
        "card.expiryYear": "2028",
        "card.cvv": "123",
        shopperResultUrl: "http://localhost:5009/api/v1/datafast/callback",
      })
    );
    console.log("PAY FULL RES SUCCESS:", JSON.stringify(p.data, null, 2));
  } catch (err: any) {
    console.log("PAY FULL RES ERROR:", err.response?.status, JSON.stringify(err.response?.data, null, 2));
  }
}
run();
