import axios from "axios";

async function f() {
  const res = await axios.get(
    "https://api.jaganaecuador.com/api/v1/datafast/callback?checkoutId=DA3F6249D054C8DC290B767B110CB0BE.uat01-vm-tx01"
  );
  console.log("STATUS:", res.status);
  console.log("CONTAINS SUCCESS:", res.data.includes("éxito") || res.data.includes("Success") || res.data.includes("INV-"));
  console.log("HTML snippet:", res.data.substring(0, 500));
}

f();
