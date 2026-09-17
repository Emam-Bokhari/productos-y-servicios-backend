import axios from "axios";

async function testCards() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entityId = "8a829418533cf31d01533d06f2ee06fa";

  const cards = [
    "4540630000000000",
    "4540630400000000",
    "4200000000000000",
  ];

  for (const cardNum of cards) {
    console.log(`\n=== Testing Card: ${cardNum} ===`);
    try {
      const createRes = await axios.post(
        "https://eu-test.oppwa.com/v1/checkouts",
        new URLSearchParams({
          entityId,
          amount: "1.12",
          currency: "USD",
          paymentType: "DB",
          "customer.givenName": "Moshfiqur",
          "customer.surname": "Rahman",
          "customer.email": "mosh@example.com",
          "customer.ip": "10.10.7.10",
          "customer.identificationDocType": "IDCARD",
          "customer.identificationDocId": "0999999999",
          "billing.street1": "Quito",
          "billing.country": "EC",
          "shipping.street1": "Quito",
          "shipping.country": "EC",
          "customParameters[SHOPPER_MID]": "1000000505",
          "customParameters[SHOPPER_TID]": "PD100406",
          "customParameters[SHOPPER_ECI]": "0103910",
          "customParameters[SHOPPER_PSERV]": "17913101",
          "customParameters[SHOPPER_VAL_BASE0]": "1.12",
          "customParameters[SHOPPER_VAL_BASEIMP]": "0.00",
          "customParameters[SHOPPER_VAL_IVA]": "0.00",
          "customParameters[SHOPPER_VERSIONDF]": "2",
          testMode: "EXTERNAL",
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const checkoutId = createRes.data.id;
      console.log("Checkout ID:", checkoutId);

      const payRes = await axios.post(
        `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment`,
        new URLSearchParams({
          paymentBrand: "VISA",
          "card.number": cardNum,
          "card.holder": "Test",
          "card.expiryMonth": "04",
          "card.expiryYear": "2028",
          "card.cvv": "123",
          shopperResultUrl: `http://localhost:5009/api/v1/datafast/callback?checkoutId=${checkoutId}`,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      console.log("Pay Status HTTP:", payRes.status);
      console.log("Pay Data:", payRes.data.result || payRes.data.redirect?.parameters);

      // Status query
      const statusRes = await axios.get(
        `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${entityId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log("STATUS QUERY RESULT:", statusRes.data.result);
      console.log("STATUS FULL DATA:", statusRes.data);
    } catch (err: any) {
      console.log("Error:", err.response?.status, err.response?.data || err.message);
    }
  }
}

testCards();
