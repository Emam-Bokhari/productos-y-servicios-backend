import axios from "axios";

async function f() {
  const token = "OGE4Mjk0MTg1MzNjZjMxZDAxNTMzZDA2ZmQwNDA3NDh8WHQ3RjIyUUVOWA==";
  try {
    const res = await axios.get("https://eu-test.oppwa.com/v1/resultcodes", {
      headers: { Authorization: "Bearer " + token }
    });
    const codes = res.data?.resultCodes || [];
    console.log("Total result codes:", codes.length);
    const match = codes.filter((r: any) => r.code?.includes("800.900") || r.code?.includes("800.100"));
    console.log("Matches:", match.slice(0, 10));
    const exact = codes.find((r: any) => r.code === "800.900.300");
    console.log("Exact 800.900.300:", exact);
  } catch (e: any) {
    console.log("Error:", e.response?.status, e.response?.data);
  }
}
f();
