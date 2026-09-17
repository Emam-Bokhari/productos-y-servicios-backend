import axios from "axios";

async function testFullFlow() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  const entityId = "8a829418533cf31d01533d06f2ee06fa"; // From Doc 3

  const amount = 5.00;
  const mTxId = `TX-${Date.now()}`;

  console.log("1. Creating checkout with Doc 3 entityId:", entityId);
  const createRes = await axios.post(
    "https://eu-test.oppwa.com/v1/checkouts",
    new URLSearchParams({
      entityId,
      amount: amount.toFixed(2),
      currency: "USD",
      paymentType: "DB",
      merchantTransactionId: mTxId,
      "customer.givenName": "Moshfiqur",
      "customer.middleName": "Rahman",
      "customer.surname": "Dev",
      "customer.ip": "10.10.7.10",
      "customer.merchantCustomerId": "CUST12345",
      "customer.email": "user@example.com",
      "customer.identificationDocType": "IDCARD",
      "customer.identificationDocId": "0999999999",
      "customer.phone": "0999999999",
      "billing.street1": "Av Siempre Viva",
      "billing.country": "EC",
      "shipping.street1": "Av Siempre Viva",
      "shipping.country": "EC",
      "customParameters[SHOPPER_MID]": "1000000505",
      "customParameters[SHOPPER_TID]": "PD100406",
      "customParameters[SHOPPER_ECI]": "0103910",
      "customParameters[SHOPPER_PSERV]": "17913101",
      "customParameters[SHOPPER_VAL_BASE0]": amount.toFixed(2),
      "customParameters[SHOPPER_VAL_BASEIMP]": "0.00",
      "customParameters[SHOPPER_VAL_IVA]": "0.00",
      "customParameters[SHOPPER_VERSIONDF]": "2",
      "risk.parameters[USER_DATA2]": "SuComercio",
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

  // Status before payment
  const s0 = await axios.get(
    `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${entityId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log("Status before payment:", s0.data.result);

  // Now submit payment
  console.log("Submitting payment...");
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
  console.log("Pay response redirect:", payRes.data.redirect?.parameters || payRes.data.result);

  // Status after payment
  try {
    const s1 = await axios.get(
      `https://eu-test.oppwa.com/v1/checkouts/${checkoutId}/payment?entityId=${entityId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log("Status after payment SUCCESS:", s1.data.result);
    console.log("Data:", s1.data);
  } catch (e: any) {
    console.log("Status after payment FAILED:", e.response?.status, e.response?.data);
  }
}

testFullFlow();
