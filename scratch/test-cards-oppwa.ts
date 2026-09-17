import axios from "axios";

async function testCards() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entityId = "8a829418533cf31d01533d06f2ee06fa";

  const cards = [
    { brand: "MASTER", num: "5123450000000008" },
    { brand: "MASTER", num: "5111111111111118" },
    { brand: "VISA", num: "4012000033330026" },
    { brand: "VISA", num: "4508750015741019" },
  ];

  for (const c of cards) {
    console.log(`\n=== Testing ${c.brand}: ${c.num} ===`);
    try {
      const cr = await axios.post(
        "https://eu-test.oppwa.com/v1/checkouts",
        new URLSearchParams({
          entityId,
          amount: "1.00",
          currency: "USD",
          paymentType: "DB",
          "customer.givenName": "Moshfiqur",
          "customer.surname": "Rahman",
          "customer.email": "mosh@example.com",
          "customParameters[SHOPPER_MID]": "1000000505",
          "customParameters[SHOPPER_TID]": "PD100406",
          "customParameters[SHOPPER_ECI]": "0103910",
          "customParameters[SHOPPER_PSERV]": "17913101",
          "customParameters[SHOPPER_VAL_BASE0]": "1.00",
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
      const cid = cr.data.id;

      const p = await axios.post(
        `https://eu-test.oppwa.com/v1/checkouts/${cid}/payment`,
        new URLSearchParams({
          paymentBrand: c.brand,
          "card.number": c.num,
          "card.holder": "Su Empresa",
          "card.expiryMonth": "12",
          "card.expiryYear": "2028",
          "card.cvv": "123",
          shopperResultUrl: `http://localhost:5009/api/v1/datafast/callback?checkoutId=${cid}`,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      console.log("Payment submitted. Redirect shortUrl:", p.data.redirect?.shortUrl);

      // Now query status
      const s = await axios.get(
        `https://eu-test.oppwa.com/v1/checkouts/${cid}/payment?entityId=${entityId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`>>> SUCCESS for ${c.num}!! Result:`, s.data.result);
      console.log("Full data:", JSON.stringify(s.data, null, 2));
      return;
    } catch (err: any) {
      console.log(`Failed for ${c.num}:`, err.response?.status, err.response?.data?.result || err.message);
    }
  }
}

testCards();
