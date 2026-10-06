import mongoose from "mongoose";
import config from "../src/config";

async function listUsers() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const users = await db
    .collection("users")
    .find({ isDeleted: { $ne: true } })
    .toArray();
  console.log(`Found ${users.length} active users:`);
  users.forEach((u, idx) => {
    console.log(
      `${idx + 1}. [${u.role}] ID: ${u._id} | Name: ${u.name} | Email: ${u.email}`,
    );
  });

  await mongoose.disconnect();
}
listUsers();
