import mongoose from "mongoose";
import bcrypt from "bcrypt";
import config from "../src/config";

async function checkPass() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;
  const user = await db
    .collection("users")
    .findOne({ email: "studentemam@gmail.com" });
  if (user && user.password) {
    const is12345678 = await bcrypt.compare("12345678", user.password);
    const is123456 = await bcrypt.compare("123456", user.password);
    const isPass = await bcrypt.compare("password", user.password);
    const isStudent = await bcrypt.compare("studentemam", user.password);
    console.log("studentemam password checks:", {
      is12345678,
      is123456,
      isPass,
      isStudent,
    });
  }
  await mongoose.disconnect();
}
checkPass();
