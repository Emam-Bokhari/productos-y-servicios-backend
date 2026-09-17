import mongoose from "mongoose";
import config from "../src/config";
import { Transaction } from "../src/app/modules/transaction/transaction.model";

async function inspectTransactions() {
  await mongoose.connect(config.database_url as string);
  const types = await Transaction.distinct("transactionType");
  console.log("Distinct transactionType in DB:", types);

  const sampleTxs = await Transaction.find().select("transactionId transactionType metadata packageId amount").lean();
  console.log("Sample Txs count:", sampleTxs.length);
  sampleTxs.forEach((t) => {
    console.log(`- ${t.transactionId}: type=${t.transactionType}, amount=${t.amount}, bookingType=${t.metadata?.bookingType}, hasPackage=${Boolean(t.packageId)}`);
  });

  await mongoose.disconnect();
}

inspectTransactions();
