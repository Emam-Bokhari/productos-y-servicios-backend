import mongoose from "mongoose";
import config from "../src/config";

async function listDbs() {
  await mongoose.connect(config.database_url as string);
  const admin = mongoose.connection.db!.admin();
  const dbs = await admin.listDatabases();
  console.log("Databases on this cluster:", dbs.databases.map(d => ({ name: d.name, sizeOnDisk: d.sizeOnDisk })));
  await mongoose.disconnect();
}
listDbs();
