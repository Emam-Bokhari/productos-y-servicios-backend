import mongoose from "mongoose";
import config from "../src/config";

async function inspectServiceUser() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;
  const user = await db.collection("users").findOne({ email: "service@gmail.com" });
  console.log("service@gmail.com user:", user ? { id: user._id, name: user.name, email: user.email, activeRole: user.activeRole } : "not found");
  await mongoose.disconnect();
}
inspectServiceUser();
