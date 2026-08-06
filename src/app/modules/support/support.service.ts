import { Types } from "mongoose";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { emailHelper } from "../../../helpers/emailHelper";
import { ISendEmail } from "../../../types/email";
import { User } from "../user/user.model";
import { TSupport } from "./support.interface";
import { Support } from "./support.model";
import QueryBuilder from "../../builder/queryBuilder";
import { emailTemplate } from "../../../shared/emailTemplate";
import { SUPPORT_PRIORITY } from "./support.constant";

const support = async (id: string, payload: TSupport) => {
  const user = await User.isExistUserById(id);

  console.log(user, payload, "USER, PAYLOAD");

  if (!user) {
    throw new ApiError(404, "No user is found in the database");
  }

  payload.userId = new Types.ObjectId(id);
  payload.name = user.name || "Unknown";
  payload.email = user.email || "Unknown";

  const supportEntry = await Support.create(payload);

  const emailPayload = emailTemplate.supportNotification({
    to: config.support_receiver_email!,
    name: payload.name || "Unknown",
    email: payload.email || "Unknown",
    subject: payload.subject,
    message: payload.message,
  });

  await emailHelper.sendEmail(emailPayload);

  return supportEntry;
};

const getAllSupportsFromDB = async (query: any) => {
  const baseQuery = Support.find().populate({
    path: "userId",
    select: "_id firstName lastName email phone role profileImage",
  });

  const queryBuilder = new QueryBuilder(baseQuery, query)
    .search(["name email subject userId"])
    .sort()
    .fields()
    .filter()
    .paginate();

  const supports = await queryBuilder.modelQuery;

  const meta = await queryBuilder.countTotal();

  if (!supports || supports.length === 0) {
    return [];
  }

  return {
    data: supports,
    meta,
  };
};

const getSupportByIdFromDB = async (id: string) => {
  const support = await Support.findById(id).populate({
    path: "userId",
    select: "firstName lastName role profileImage email _id phone",
  });

  if (!support) {
    throw new ApiError(404, "No support is found by this ID");
  }

  return support;
};

const deleteSupportByIdFromDB = async (id: string) => {
  const support = await Support.softDeleteById(id);
  if (!support) {
    throw new ApiError(400, "Failed to delete this support by this ID");
  }

  return support;
};

export const SupportServices = {
  support,
  getAllSupportsFromDB,
  getSupportByIdFromDB,
  deleteSupportByIdFromDB,
};
