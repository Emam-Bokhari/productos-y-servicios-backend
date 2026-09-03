import { STATUS, USER_ROLES } from "../../../enums/user";
import { IUser } from "./user.interface";
import { JwtPayload, Secret } from "jsonwebtoken";
import { User } from "./user.model";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import unlinkFile from "../../../shared/unlinkFile";
import { jwtHelper } from "../../../helpers/jwtHelper";
import config from "../../../config";
import QueryBuilder from "../../builder/queryBuilder";
import generateOTP from "../../../util/generateOTP";
import { emailTemplate } from "../../../shared/emailTemplate";
import { emailHelper } from "../../../helpers/emailHelper";
import bcrypt from "bcrypt";
import { sendNotifications } from "../../../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../notification/notification.constant";
import { Subscription } from "../subscription/subscription.model";
import { Store } from "../store/store.model";

// --- ADMIN SERVICES ---
const createAdminToDB = async (payload: any): Promise<IUser> => {
  const isExistAdmin = await User.findOne({ email: payload.email });
  if (isExistAdmin) {
    throw new ApiError(StatusCodes.CONFLICT, "This Email already taken");
  }

  const adminPayload = {
    ...payload,
    verified: true,
    status: STATUS.ACTIVE,
    role: USER_ROLES.ADMIN,
  };

  const createAdmin = await User.create(adminPayload);

  return createAdmin;
};

const getAdminFromDB = async (query: any) => {
  const baseQuery = User.find({
    role: { $in: [USER_ROLES.ADMIN] },
  }).select("name email role profileImage createdAt updatedAt status");

  const queryBuilder = new QueryBuilder<IUser>(baseQuery, query)
    .search(["name", "email"])
    .filter()
    .sort()
    .fields()
    .paginate();

  const admins = await queryBuilder.modelQuery;

  const meta = await queryBuilder.countTotal();

  return {
    data: admins,
    meta,
  };
};

const getSuperAdminFromDB = async () => {
  const result = await User.findOne({
    role: USER_ROLES.SUPER_ADMIN,
  }).select(
    "-password -authentication -deviceToken -stripeCustomerId -stripeConnectedAccountId",
  );

  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Super admin not found");
  }

  return result;
};

const updateAdminStatusByIdToDB = async (
  id: string,
  status: STATUS.ACTIVE | STATUS.INACTIVE,
) => {
  if (![STATUS.ACTIVE, STATUS.INACTIVE].includes(status)) {
    throw new ApiError(400, "Status must be either 'active' or 'inactive'");
  }

  const user = await User.findOne({
    _id: id,
    role: USER_ROLES.ADMIN,
  });
  if (!user) {
    throw new ApiError(404, "No admin is found by this user ID");
  }

  const result = await User.findByIdAndUpdate(id, { status }, { new: true });
  if (!result) {
    throw new ApiError(400, "Failed to change status by this user ID");
  }

  return result;
};

const deleteAdminFromDB = async (id: any) => {
  const isExistAdmin = await User.softDeleteById(id);

  if (!isExistAdmin) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to delete Admin");
  }

  return isExistAdmin;
};

// --- USER SERVICES ---
const createUserToDB = async (payload: any) => {
  const isExistUser = await User.findOne({ email: payload.email });
  if (isExistUser) {
    throw new ApiError(StatusCodes.CONFLICT, "This Email already taken");
  }

  const { referredByCode, ...userData } = payload;

  const createUser = await User.create(userData);
  if (!createUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Failed to create user");
  }

  //send email
  const otp = generateOTP();
  const values = {
    name: createUser.name,
    otp: Number(otp),
    email: createUser.email!,
  };

  const createAccountTemplate = emailTemplate.createAccount(values);
  emailHelper.sendEmail(createAccountTemplate);

  //save to DB
  const authentication = {
    oneTimeCode: otp,
    expireAt: new Date(Date.now() + 3 * 60000),
  };

  await User.findOneAndUpdate(
    { _id: createUser._id },
    { $set: { authentication } },
  );

  const createToken = jwtHelper.createToken(
    {
      id: createUser._id,
      email: createUser.email,
      role: [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(
        createUser.role as any,
      )
        ? createUser.role
        : createUser.activeRole || createUser.role,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  const result = {
    token: createToken,
    user: createUser,
  };

  // notify admin
  const admin = await User.findOne({ role: USER_ROLES.SUPER_ADMIN }).select(
    "_id name",
  );

  if (admin) {
    await sendNotifications({
      title: "New User Signup",
      text: `New user signed up successfully`,
      receiver: admin._id.toString(),
      type: NOTIFICATION_TYPE.ADMIN,
      referenceId: result.user._id.toString(),
      referenceModel: "User",
    });
  }

  return result;
};

const getMyProfileFromDB = async (userId: string) => {
  const result = await User.findById(userId);
  if (!result) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User not found");
  }

  // Find active store subscription, otherwise latest
  let storeSubscription = await Subscription.findOne({
    userId,
    packageType: "store_creation",
    status: { $in: ["active", "trialing"] },
    expiresAt: { $gt: new Date() },
  });
  if (!storeSubscription) {
    storeSubscription = await Subscription.findOne({
      userId,
      packageType: "store_creation",
    }).sort({ createdAt: -1 });
  }

  // Find active post subscription, otherwise latest
  let postSubscription = await Subscription.findOne({
    userId,
    packageType: "post_add",
    status: { $in: ["active", "trialing"] },
    expiresAt: { $gt: new Date() },
  });
  if (!postSubscription) {
    postSubscription = await Subscription.findOne({
      userId,
      packageType: "post_add",
    }).sort({ createdAt: -1 });
  }

  const store = await Store.findOne({ owner: userId });
  const isStoreCreated = !!store;

  const isStoreSubscribed = storeSubscription
    ? ["active", "trialing"].includes(storeSubscription.status) &&
      storeSubscription.expiresAt > new Date()
    : false;

  const isPostSubscribed = postSubscription
    ? ["active", "trialing"].includes(postSubscription.status) &&
      postSubscription.expiresAt > new Date()
    : false;

  return {
    ...result.toObject(),
    isStoreCreated,
    storeType: store ? store.storeType : null,
    isSubscribed: isStoreSubscribed || isPostSubscribed,
    storeSubscription: {
      isPurchased: isStoreSubscribed,
      expiresAt: storeSubscription ? storeSubscription.expiresAt : null,
    },
    postSubscription: {
      isPurchased: isPostSubscribed,
      expiresAt: postSubscription ? postSubscription.expiresAt : null,
    },
  };
};

const updateProfileToDB = async (
  user: JwtPayload,
  payload: Partial<IUser>,
): Promise<Partial<IUser | null>> => {
  const { id } = user;
  const isExistUser = await User.isExistUserById(id);
  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  //unlink file here
  if (payload.profileImage && isExistUser.profileImage) {
    unlinkFile(isExistUser.profileImage);
  }

  const updateDoc = await User.findOneAndUpdate({ _id: id }, payload, {
    new: true,
  });
  return updateDoc;
};

const getUsersFromDB = async (query: Record<string, unknown>) => {
  const baseQuery = User.find({
    role: { $in: [USER_ROLES.USER, USER_ROLES.SELLER] },
  }).populate("store", "displayName _id");

  const queryBuilder = new QueryBuilder<IUser>(baseQuery, query)
    .search(["name", "email"])
    .filter()
    .sort()
    .fields()
    .paginate();

  const users = await queryBuilder.modelQuery;
  const meta = await queryBuilder.countTotal();

  return {
    data: users,
    meta,
  };
};

const getUserByIdFromDB = async (id: string) => {
  const result = await User.findOne({
    _id: id,
    role: { $in: [USER_ROLES.USER, USER_ROLES.SELLER] },
  }).populate({
    path: "store",
    populate: {
      path: "cityId",
    },
  });

  if (!result)
    throw new ApiError(404, "No user is found in the database by this ID");

  return result;
};

const updateUserStatusByIdToDB = async (
  id: string,
  status: STATUS.ACTIVE | STATUS.INACTIVE,
) => {
  if (![STATUS.ACTIVE, STATUS.INACTIVE].includes(status)) {
    throw new ApiError(400, "Status must be either 'ACTIVE' or 'INACTIVE'");
  }

  const user = await User.findOne({
    _id: id,
    role: { $in: [USER_ROLES.USER, USER_ROLES.SELLER] },
  });
  if (!user) {
    throw new ApiError(404, "No user is found by this user ID");
  }

  const result = await User.findByIdAndUpdate(id, { status }, { new: true });
  if (!result) {
    throw new ApiError(400, "Failed to change status by this user ID");
  }

  return result;
};

const deleteUserByIdFromD = async (id: string) => {
  const user = await User.findOne({
    _id: id,
    role: { $in: [USER_ROLES.USER, USER_ROLES.SELLER] },
  });

  if (!user) {
    throw new ApiError(404, "User does not exist in the database");
  }

  const result = await User.findByIdAndDelete(id);

  if (!result) {
    throw new ApiError(400, "Failed to delete user by this ID");
  }

  return result;
};

const deleteProfileFromDB = async (id: string, password: string) => {
  // user exists?
  const user = await User.findById(id).select("+password");
  if (!user) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  // check password
  const isPasswordMatch = await bcrypt.compare(password, user.password!);
  if (!isPasswordMatch) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Password is incorrect!");
  }

  // delete user
  const result = await User.findByIdAndDelete(id);
  if (!result) {
    throw new ApiError(400, "Failed to delete this user");
  }

  return result;
};



export const UserService = {
  createUserToDB,
  getUsersFromDB,
  getAdminFromDB,
  getSuperAdminFromDB,
  deleteAdminFromDB,
  getUserByIdFromDB,
  getMyProfileFromDB,
  updateProfileToDB,
  createAdminToDB,
  updateUserStatusByIdToDB,
  updateAdminStatusByIdToDB,
  deleteUserByIdFromD,
  deleteProfileFromDB,
};