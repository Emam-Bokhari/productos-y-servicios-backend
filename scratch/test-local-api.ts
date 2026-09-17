import { User } from "../src/app/modules/user/user.model";
import mongoose from "mongoose";
import config from "../src/config";
import { jwtHelper } from "../src/helpers/jwtHelper";
import axios from "axios";

async function testLocalApi() {
  await mongoose.connect(config.database_url as string);
  const user = await User.findOne({ email: "studentemam@gmail.com" });
  if (!user) {
    console.log("No user found");
    return;
  }
  const token = jwtHelper.createToken(
    { id: user._id, role: user.role, email: user.email },
    config.jwt.jwt_secret as string,
    config.jwt.jwt_expire_in as string
  );

  console.log("Token created successfully.");

  try {
    const res = await axios.post(
      "http://10.10.7.10:5009/api/v1/datafast/create-checkout-session",
      {
        packageId: "6a7ff377c24d0046a564c737",
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log("Response from local server 5009:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("Local 5009 error:", err.response?.data || err.message);
  }
  await mongoose.disconnect();
}

testLocalApi();
