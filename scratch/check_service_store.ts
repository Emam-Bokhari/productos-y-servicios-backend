import mongoose from "mongoose";
import config from "../src/config";

async function checkServiceStore() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const serviceStore = await db
    .collection("stores")
    .findOne({ displayName: "ServiPro - Limpieza & Mantenimiento Integral" });
  console.log(
    "ServiPro store:",
    serviceStore
      ? {
          id: serviceStore._id,
          owner: serviceStore.owner,
          displayName: serviceStore.displayName,
          storeType: serviceStore.storeType,
        }
      : "not found",
  );

  const serviceUser = await db
    .collection("users")
    .findOne({ email: "service@gmail.com" });
  console.log(
    "service@gmail.com:",
    serviceUser
      ? {
          id: serviceUser._id,
          name: serviceUser.name,
          email: serviceUser.email,
          activeRole: serviceUser.activeRole,
          subscriptionStatus: serviceUser.subscriptionStatus,
        }
      : "not found",
  );

  const currentStoreForServiceUser = await db
    .collection("stores")
    .findOne({ owner: serviceUser?._id });
  console.log(
    "Current store for service@gmail.com:",
    currentStoreForServiceUser
      ? {
          id: currentStoreForServiceUser._id,
          displayName: currentStoreForServiceUser.displayName,
          storeType: currentStoreForServiceUser.storeType,
        }
      : "none",
  );

  await mongoose.disconnect();
}
checkServiceStore();
