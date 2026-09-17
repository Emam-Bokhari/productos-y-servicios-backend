import axios from "axios";

async function testRedirectFlow() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entityId = "8a8294185a65bf5e015a6c8b89a10d8d";

  console.log("1. Creating checkout...");
  const createRes = await axios.post(
    "https://test.oppwa.com/v1/checkouts",
    new URLSearchParams({
      entityId,
      amount: "10.00",
      currency: "USD",
      paymentType: "DB",
      "customParameters[SHOPPER_MID]": "1000000505",
      "customParameters[SHOPPER_TID]": "PD100406",
      "customParameters[SHOPPER_ECI]": "0103910",
      "customParameters[SHOPPER_PSERV]": "17913101",
      "customParameters[SHOPPER_VAL_BASE0]": "10.00",
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
  console.log("Created Checkout ID:", checkoutId);

  console.log("2. Submitting payment form (Simulating widget POST)...");
  const payRes = await axios.post(
    `https://test.oppwa.com/v1/checkouts/${checkoutId}/payment`,
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
  console.log("Pay response:", payRes.data);

  if (payRes.data.redirect?.shortUrl) {
    console.log("3. Following shortUrl:", payRes.data.redirect.shortUrl);
    try {
      const redRes = await axios.get(payRes.data.redirect.shortUrl, {
        maxRedirects: 5,
      });
      console.log("Redirect Followed Status:", redRes.status);
      console.log("Redirect Final URL:", redRes.request?.res?.responseUrl || redRes.config.url);
      console.log("Redirect Data Preview:", String(redRes.data).substring(0, 300));
    } catch (redErr: any) {
      console.log("Redirect error:", redErr.message);
    }
  }

  console.log("4. Checking status from Oppwa after following redirect...");
  try {
    const checkRes = await axios.get(
      `https://test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${entityId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log("STATUS SUCCESS:", checkRes.data.result);
    console.log("FULL DATA:", checkRes.data);
  } catch (err: any) {
    console.log("STATUS FAILED:", err.response?.status, err.response?.data);
  }
}

testRedirectFlow();
