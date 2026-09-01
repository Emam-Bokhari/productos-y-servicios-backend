import { Model, Types } from "mongoose";
import { GENDER, STATUS, USER_ROLES } from "../../../enums/user";
import { ISoftDeleteModel } from "../../../types/softDelete";

export type IUser = {
  name: string;
  role: USER_ROLES;
  email: string;
  profileImage?: string;
  stripeConnectedAccountId?: string;
  stripeCustomerId?: string;
  password?: string;
  verified: boolean;
  phone?: string;
  countryCode?: string;
  status: STATUS;
  firebaseUid?: string;
  dateOfBirth?: Date;
  gender?: GENDER;
  userName?: string;
  deviceToken?: string;
  location?: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude],
    address: string;
  };
  authentication?: {
    isResetPassword: boolean;
    oneTimeCode: number;
    expireAt: Date;
  };
  averageRating?: number;
  totalRatings?: number;
  totalReviews?: number;
  activeRole?: "user" | "seller";
  subscriptionStatus?:
    | "active"
    | "inactive"
    | "trialing"
    | "past_due"
    | "canceled"
    | "none";
  subscriptionPackageId?: Types.ObjectId | string;
  stripeSubscriptionId?: string;
  subscriptionExpiresAt?: Date;
  timezone?: string;
  country?: string;
  postalCode?: string;
  state?: string;
  address?: string;
};

export type UserModal = {
  isExistUserById(id: string): any;
  isExistUserByEmail(email: string): any;
  isAccountCreated(id: string): any;
  isMatchPassword(password: string, hashPassword: string): boolean;
} & Model<IUser>;

export type IUserModel = ISoftDeleteModel<IUser> & UserModal;
