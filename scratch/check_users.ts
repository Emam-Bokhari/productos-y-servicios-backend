import mongoose from "mongoose";
import config from "../src/config";

async function checkUsers() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;
  const users = await db.collection("users").find({
    email: { $in: ["studentemam@gmail.com", "datafast.merchant.2026@gmail.com", "bokhari@gmail.com", "kanec22125@bocably.com"] }
  }).toArray();
  console.log(JSON.stringify(users, null, 2));
  await mongoose.disconnect();
}
checkUsers();
