import mongoose from "mongoose";
import config from "../src/config";

async function addUserName() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  await db.collection("users").updateOne(
    { email: "studentemam@gmail.com" },
    { $set: { userName: "studentemam" } }
  );

  await db.collection("users").updateOne(
    { email: "adrianrivego@hotmail.com" },
    { $set: { userName: "adrianrivego" } }
  );

  await db.collection("users").updateOne(
    { email: "bokhari1@gmail.com" },
    { $set: { userName: "bokhari1" } }
  );

  await db.collection("users").updateOne(
    { email: "service@gmail.com" },
    { $set: { userName: "service" } }
  );

  console.log("Updated usernames for test users!");
  const users = await db.collection("users").find({
    email: { $in: ["studentemam@gmail.com", "adrianrivego@hotmail.com", "bokhari1@gmail.com", "service@gmail.com"] }
  }).project({ name: 1, email: 1, userName: 1, activeRole: 1 }).toArray();
  console.log(users);

  await mongoose.disconnect();
}

addUserName();
