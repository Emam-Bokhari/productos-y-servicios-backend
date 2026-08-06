import { z } from "zod";

const createAdminZodSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Name is required" }),
    email: z.string().optional(),
    phone: z.string({ required_error: "Phone is required" }),
    countryCode: z.string({ required_error: "Country code is required" }),
    password: z.string({ required_error: "Password is required" }),
    role: z.string({ required_error: "Role is required" }),
  }),
});

export const UserValidation = { createAdminZodSchema };
