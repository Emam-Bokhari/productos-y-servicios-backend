import datafastService from "../src/app/modules/datafast/datafast.service";

async function testRecurring() {
  const dummyToken = "8ac7a4a26ccd39af016cce74ce5f4g4f";
  try {
    const res = await datafastService.executeRecurringPayment(dummyToken, 1.12, "12345");
    console.log("Recurring Response:", JSON.stringify(res, null, 2));
  } catch (err: any) {
    console.error("Recurring Error (Expected token not found):", err.message);
  }
}
testRecurring();
