import axios from "axios";

async function f() {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhYWI2N2I1OWIzMjAzMjlhYWQxYzczNSIsImVtYWlsIjoiZGF0YWZhc3QubWVyY2hhbnQuMjAyNkBnbWFpbC5jb20iLCJyb2xlIjoidXNlciIsImlhdCI6MTc4OTYxODM4MiwiZXhwIjoxNzkyMjEwMzgyfQ.jF-sDriUYbOFzfUcwPKcK3tArszeKSGsTxS2FS-jS2Y";
  try {
    const res = await axios.post(
      "https://api.jaganaecuador.com/api/v1/datafast/create-checkout-session",
      {
        packageId: "6a7ff377c24d0046a564c737",
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log("STATUS:", res.status);
    console.log("PAYMENT_URL:", res.data.data.paymentUrl);
  } catch (err: any) {
    console.log("ERROR:", err.response?.status, err.response?.data);
  }
}

f();
