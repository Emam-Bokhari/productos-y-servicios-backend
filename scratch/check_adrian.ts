import mongoose from "mongoose";
import config from "../src/config";
import { AuthService } from "../src/app/modules/auth/auth.service";

async function check() {
  await mongoose.connect(config.database_url as string);
  const db = mongoose.connection.db!;

  const user = await db
    .collection("users")
    .findOne({ email: "adrianrivego@hotmail.com" });
  console.log("Found user exactly by email:", user);

  const regexUsers = await db
    .collection("users")
    .find({ email: { $regex: "adrian", $options: "i" } })
    .toArray();
  console.log(
    "Regex adrian:",
    regexUsers.map((u) => ({
      id: u._id,
      email: u.email,
      name: u.name,
      status: u.status,
      verified: u.verified,
    })),
  );

  // Try calling login directly
  console.log("\nAttempting AuthService.loginUserFromDB:");
  try {
    const res = await AuthService.loginUserFromDB({
      email: "adrianrivego@hotmail.com",
      password: "12345678",
    });
    console.log("Login SUCCESS:", res.user.email);
  } catch (err: any) {
    console.log("Login ERROR:", err.message, err.statusCode);
  }

  // Also check all users in database
  const allUsers = await db
    .collection("users")
    .find({})
    .project({ email: 1, name: 1, role: 1, activeRole: 1 })
    .toArray();
  console.log("\nAll user emails count:", allUsers.length);
  console.log(allUsers.map((u) => u.email));

  await mongoose.disconnect();
}
check();
