import { z } from "zod";
import { GENDER, USER_ROLES } from "../../../enums/user";

const createAdminZodSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Name is required" }),
    email: z.string().optional(),
    phone: z.string().optional(),
    countryCode: z.string().optional(),
    password: z.string({ required_error: "Password is required" }),
    role: z.string({ required_error: "Role is required" }),
  }),
});

const createUserZodSchema = z.object({
  body: z
    .object({
      name: z.string({ required_error: "Name is required" }),
      email: z
        .string({ required_error: "Email is required" })
        .email("Invalid email format"),
      password: z
        .string({ required_error: "Password is required" })
        .min(8, "Password must be at least 8 characters"),
      documentType: z.enum(["nid", "passport"], {
        required_error: "Document type must be either 'nid' or 'passport'",
      }),
      documentNumber: z.string().optional(),
      idNumber: z.string().optional(),
      cedula: z.string().optional(),
      passportNumber: z.string().optional(),
      documentFront: z.string({
        required_error: "Identity document (front) is required",
      }),
      documentBack: z.string().optional(),
      role: z
        .enum([USER_ROLES.USER, USER_ROLES.SELLER])
        .optional()
        .default(USER_ROLES.USER),
      phone: z.string().optional(),
      countryCode: z.string().optional(),
      profileImage: z.string().optional(),
      gender: z.nativeEnum(GENDER).optional(),
      dateOfBirth: z.string().optional(),
      address: z.string().optional(),
      country: z.string().optional(),
      province: z.string().optional(),
      city: z.string().optional(),
      canton: z.string().optional(),
      sector: z.string().optional(),
      neighborhood: z.string().optional(),
      postalCode: z.string().optional(),
      referredByCode: z.string().optional(),
    })
    .refine(
      (data) =>
        Boolean(
          (data.documentNumber && data.documentNumber.trim().length > 0) ||
            (data.idNumber && data.idNumber.trim().length > 0) ||
            (data.cedula && data.cedula.trim().length > 0) ||
            (data.passportNumber && data.passportNumber.trim().length > 0),
        ),
      {
        message: "National ID (Cédula) or passport number is required",
        path: ["documentNumber"],
      },
    ),
});

export const UserValidation = { createAdminZodSchema, createUserZodSchema };
