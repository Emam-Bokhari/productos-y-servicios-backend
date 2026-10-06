import mongoose from "mongoose";
import config from "../src/config";

async function checkWhy() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const stores = await db.collection("stores").find({}).toArray();
  const storeOwnerIds = stores.map((s) => s.owner.toString());
  console.log("Store owner IDs (strings):", storeOwnerIds);

  const studentUser = await db
    .collection("users")
    .findOne({ email: "studentemam@gmail.com" });
  console.log("studentemam ID:", studentUser?._id.toString());
  console.log(
    "Is studentemam in storeOwnerIds?",
    storeOwnerIds.includes(studentUser?._id.toString()),
  );

  const adrianUser = await db
    .collection("users")
    .findOne({ email: "adrianrivego@hotmail.com" });
  console.log("adrian ID:", adrianUser?._id.toString());
  console.log(
    "Is adrian in storeOwnerIds?",
    storeOwnerIds.includes(adrianUser?._id.toString()),
  );
  console.log("adrian activeRole:", adrianUser?.activeRole);

  await mongoose.disconnect();
}
checkWhy();
