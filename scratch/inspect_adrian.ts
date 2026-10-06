import mongoose from "mongoose";
import config from "../src/config";

async function inspectAdrian() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;
  const user = await db.collection("users").findOne({ email: "adrianrivego@hotmail.com" });
  console.log("Adrian user:", JSON.stringify(user, null, 2));

  const store = await db.collection("stores").findOne({ owner: user?._id });
  console.log("Adrian store:", JSON.stringify(store, null, 2));

  const seller = await db.collection("sellers").findOne({ user: user?._id });
  console.log("Adrian seller:", JSON.stringify(seller, null, 2));

  const services = await db.collection("services").find({ storeId: store?._id }).toArray();
  console.log("Adrian services count:", services.length);
  console.log(services.map(s => s.title));

  await mongoose.disconnect();
}
inspectAdrian();
