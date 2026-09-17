import axios from "axios";

async function testMerchantQuery() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entityId = "8a8294185a65bf5e015a6c8b89a10d8d";

  // Let's create a fresh checkout with known merchantTransactionId
  const mTxId = `TX-${Date.now()}`;
  console.log("Creating checkout with merchantTransactionId:", mTxId);
  const createRes = await axios.post(
    "https://eu-test.oppwa.com/v1/checkouts",
    new URLSearchParams({
      entityId,
      amount: "10.00",
      currency: "USD",
      paymentType: "DB",
      merchantTransactionId: mTxId,
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
  console.log("Created checkout:", checkoutId);

  // Submit test payment
  await axios.post(
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

  console.log("Querying by merchantTransactionId:", mTxId);
  try {
    const queryRes = await axios.get(
      `https://eu-test.oppwa.com/v1/query?entityId=${entityId}&merchantTransactionId=${mTxId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log("Query Response:", queryRes.data);
  } catch (err: any) {
    console.log("Query Error:", err.response?.status, err.response?.data);
  }
}

testMerchantQuery();
