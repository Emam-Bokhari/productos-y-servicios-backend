import jwt from "jsonwebtoken";
import config from "../src/config";

const token = jwt.sign(
  {
    id: "6aab67b59b320329aad1c735",
    email: "datafast.merchant.2026@gmail.com",
    role: "user",
  },
  config.jwt.jwt_secret as string,
  { expiresIn: "30d" }
);

console.log("LOGIN_JWT_TOKEN:", token);
