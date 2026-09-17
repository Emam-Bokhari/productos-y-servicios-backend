import axios from "axios";

async function testEntityComparison() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entities = [
    { name: "Doc 3 Entity (f2ee06fa)", id: "8a829418533cf31d01533d06f2ee06fa" },
    { name: "Doc 2 / .env Entity (a10d8d)", id: "8a8294185a65bf5e015a6c8b89a10d8d" },
  ];

  for (const ent of entities) {
    console.log(`\n=== Testing Checkout Creation with ${ent.name} ===`);
    try {
      const createRes = await axios.post(
        "https://eu-test.oppwa.com/v1/checkouts",
        new URLSearchParams({
          entityId: ent.id,
          amount: "10.00",
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
      console.log(`Checkout created successfully! ID: ${checkoutId}`);

      // Now query status immediately
      const statusRes = await axios.get(
        `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${ent.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log(`Initial Status:`, statusRes.data.result);

      // Now simulate payment with test card 4200 0000 0000 0000
      console.log("Submitting test card 4200000000000000...");
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
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
      console.log("Pay response redirect:", payRes.data.redirect?.parameters || payRes.data.result);

      // Now query status AFTER payment!
      const statusAfterRes = await axios.get(
        `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${ent.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log(`AFTER PAYMENT STATUS:`, statusAfterRes.data.result);
      console.log(`FULL DATA:`, {
        id: statusAfterRes.data.id,
        paymentBrand: statusAfterRes.data.paymentBrand,
        amount: statusAfterRes.data.amount,
        registrationId: statusAfterRes.data.registrationId,
        result: statusAfterRes.data.result,
      });
    } catch (err: any) {
      console.error(`ERROR with ${ent.name}:`, err.response?.status, err.response?.data || err.message);
    }
  }
}

testEntityComparison();
