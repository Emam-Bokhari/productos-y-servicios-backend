import axios from "axios";
import mongoose from "mongoose";
import config from "../src/config";
import { AuthService } from "../src/app/modules/auth/auth.service";

async function testAll() {
  await mongoose.connect(config.database_url as string);

  console.log("=== LOCAL AUTH SERVICE TEST ===");
  const testEmails = [
    "studentemam@gmail.com",
    "service@gmail.com",
    "adrianrivego@hotmail.com",
    "adrianrivego@gmail.com",
    "adrianrivera@gmail.com",
    "adrianrivera@hotmail.com",
    "bokhari1@gmail.com",
  ];

  for (const email of testEmails) {
    try {
      const res = await AuthService.loginUserFromDB({
        email,
        password: "12345678",
      });
      console.log(
        `✔ [LOCAL] ${email}: SUCCESS (Role: ${res.user.activeRole}, HasSeller: ${res.hasSellerAccount})`,
      );
    } catch (err: any) {
      console.log(`❌ [LOCAL] ${email}: FAILED -> ${err.message}`);
    }
  }

  console.log("\n=== REMOTE API TEST (api.jaganaecuador.com) ===");
  const remoteUrl = "https://api.jaganaecuador.com/api/v1/auth/login";
  for (const email of testEmails) {
    try {
      const res = await axios.post(remoteUrl, { email, password: "12345678" });
      console.log(
        `✔ [REMOTE] ${email}: SUCCESS (HasSeller: ${res.data?.data?.hasSellerAccount})`,
      );
    } catch (err: any) {
      console.log(
        `❌ [REMOTE] ${email}: FAILED -> ${err.response?.data?.message || err.message}`,
      );
    }
  }

  await mongoose.disconnect();
}

testAll();
