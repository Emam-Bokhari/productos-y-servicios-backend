import axios from "axios";

async function testFase1() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entityId = "8a829418533cf31d01533d06f2ee06fa";

  console.log("Creating checkout in Fase 1 mode (NO testMode=EXTERNAL, exactly like Page 12)...");
  const createRes = await axios.post(
    "https://eu-test.oppwa.com/v1/checkouts",
    new URLSearchParams({
      entityId,
      amount: "92.00",
      currency: "USD",
      paymentType: "DB",
    }).toString(),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const checkoutId = createRes.data.id;
  console.log("Fase 1 Checkout ID:", checkoutId);

  console.log("Submitting test card 4200000000000000 (from Page 14)...");
  const payRes = await axios.post(
    `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment`,
    new URLSearchParams({
      paymentBrand: "VISA",
      "card.number": "4200000000000000",
      "card.holder": "Su Empresa",
      "card.expiryMonth": "12",
      "card.expiryYear": "2028",
      "card.cvv": "123",
      shopperResultUrl: `http://localhost:5009/api/v1/datafast/callback?checkoutId=${checkoutId}`,
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  console.log("Pay Status HTTP:", payRes.status);

  // Status query (Page 15 Figura 9)
  console.log("Querying status (Page 15 Figura 9)...");
  try {
    const s = await axios.get(
      `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${entityId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log(">>> FASE 1 QUERY SUCCESS! Result:", s.data.result);
    console.log("FULL DATA:", JSON.stringify(s.data, null, 2));
  } catch (err: any) {
    console.log("FASE 1 QUERY FAILED:", err.response?.status, err.response?.data);
  }
}

testFase1();
