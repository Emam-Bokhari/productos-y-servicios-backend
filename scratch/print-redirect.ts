import axios from "axios";

async function printRed() {
  const res = await axios.get("https://test.oppwa.com/v1/checkouts/110224233962A370215B033ED182E60F.uat01-vm-tx01/redirect");
  console.log("HTML length:", res.data.length);
  console.log(res.data);
}

printRed();
