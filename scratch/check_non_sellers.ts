import mongoose from "mongoose";
import config from "../src/config";

async function check() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;
  const user1 = await db.collection("users").findOne({ email: "bokhari1@gmail.com" });
  console.log("bokhari1:", user1 ? { id: user1._id, name: user1.name, email: user1.email, role: user1.role } : "not found");

  const regularUsers = await db.collection("users").find({ activeRole: "user", role: "user" }).toArray();
  console.log(`Found ${regularUsers.length} non-seller users:`);
  regularUsers.slice(0, 10).forEach(u => console.log(`- ${u.name} (${u.email})`));

  await mongoose.disconnect();
}
check();
