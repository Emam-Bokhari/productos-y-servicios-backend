import mongoose from "mongoose";
import config from "../src/config";

async function checkStudent() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;
  const user = await db
    .collection("users")
    .findOne({ email: "studentemam@gmail.com" });
  console.log("student user:", user);
  await mongoose.disconnect();
}
checkStudent();
