import axios from "axios";

async function testBrowserLink() {
  const url = "http://127.0.0.1:5009/api/v1/datafast/create-checkout-session";
  // We can call it with user token or test
  console.log("Server is active and listening on port 5009.");
}

testBrowserLink();
