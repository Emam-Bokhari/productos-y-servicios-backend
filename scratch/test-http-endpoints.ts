import axios from "axios";

const BASE_URL = "http://10.10.7.10:5009/api/v1";

async function testHttpEndpoints() {
  console.log("=== Testing HTTP Endpoints on Port 5009 ===");

  try {
    // 1. Login
    console.log("1. Logging in as merchant...");
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: "datafast.merchant.2026@gmail.com",
      password: "Password123!",
    });

    const userToken = loginRes.data.data?.token;
    if (!userToken) throw new Error("No token returned from login");
    console.log("   ✔ Logged in successfully! User Token obtained.");

    const userHeaders = {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    };

    // 2. Verify seller status and get seller token
    console.log("\n2. Calling GET /api/v1/advertisements/verify-seller...");
    const verifyRes = await axios.get(`${BASE_URL}/advertisements/verify-seller`, {
      headers: userHeaders,
    });
    console.log(`   ✔ Seller verification response: ${verifyRes.data.message}`);
    const sellerToken = verifyRes.data.data?.tokens?.accessToken || userToken;
    console.log("   ✔ Seller access token acquired!");

    const sellerHeaders = {
      Authorization: `Bearer ${sellerToken}`,
      "Content-Type": "application/json",
    };

    // 3. Create Checkout Session for Position 2 (Position price should be $80)
    console.log("\n3. Calling POST /api/v1/datafast/create-checkout-session for Position 2...");
    const sessionRes = await axios.post(
      `${BASE_URL}/datafast/create-checkout-session`,
      {
        cityConfigId: "6aaa3703dac1e18f5f869b25",
        position: 2,
      },
      { headers: sellerHeaders },
    );

    console.log("   Status:", sessionRes.status);
    console.log("   Checkout Response:", JSON.stringify(sessionRes.data, null, 2));
    const checkoutId = sessionRes.data.data?.checkoutId;
    const paymentUrl = sessionRes.data.data?.paymentUrl;
    console.log(`   ✔ Session created with checkoutId: ${checkoutId}`);
    console.log(`   ✔ Payment URL: ${paymentUrl}`);

    // 4. Test Pay Page
    console.log("\n4. Testing GET payment widget page...");
    const payPageRes = await axios.get(paymentUrl);
    console.log(`   ✔ Payment HTML page rendered (status: ${payPageRes.status}, length: ${payPageRes.data.length})`);

    // 5. Test Callback to fulfill payment
    console.log("\n5. Simulating Datafast callback...");
    const callbackRes = await axios.get(`${BASE_URL}/datafast/callback`, {
      params: { checkoutId },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    console.log(`   ✔ Callback status: ${callbackRes.status}`);
    const redirectLocation = callbackRes.headers.location;
    console.log(`   ✔ Redirect Location: ${redirectLocation}`);

    // 6. Test creating advertisement via API
    console.log("\n6. Testing POST /api/v1/advertisements for Position 2...");
    const adRes = await axios.post(
      `${BASE_URL}/advertisements`,
      {
        data: JSON.stringify({
          cityAdConfigId: "6aaa3703dac1e18f5f869b25",
          advertisementType: "featured",
          campaignName: `HTTP Test Campaign Pos 2 - ${Date.now()}`,
          position: 2,
          startDate: new Date().toISOString(),
          featuredImage: "https://example.com/banner-pos-2.jpg",
        }),
      },
      { headers: sellerHeaders },
    );

    console.log("   ✔ Advertisement created successfully!");
    console.log("   Ad Data:", JSON.stringify(adRes.data.data, null, 2));
    console.log(`   ✔ Position 2 charged price: $${adRes.data.data?.price}`);

    // 7. Test Invoice Preview endpoint
    if (redirectLocation) {
      const urlParams = new URL(redirectLocation).searchParams;
      const invoiceNumber = urlParams.get("invoiceNumber");
      if (invoiceNumber) {
        console.log(`\n7. Testing GET /api/v1/invoices/preview/${invoiceNumber}...`);
        const invoiceRes = await axios.get(`${BASE_URL}/invoices/preview/${invoiceNumber}`, {
          responseType: "arraybuffer",
        });
        console.log(`   ✔ Invoice PDF preview fetched: ${invoiceRes.data.length} bytes (Status: ${invoiceRes.status})`);
      }
    }

    console.log("\n=========================================");
    console.log("   ALL HTTP ENDPOINTS PASSED COMPLETELY! ");
    console.log("=========================================");
  } catch (err: any) {
    if (err.response) {
      console.error("HTTP Error Response:", err.response.status, err.response.data);
    } else {
      console.error("Error:", err.message);
    }
    process.exit(1);
  }
}

testHttpEndpoints();
