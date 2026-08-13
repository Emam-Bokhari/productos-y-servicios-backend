import { model, Schema } from "mongoose";
import { GENDER, STATUS, USER_ROLES } from "../../../enums/user";
import { IUser, IUserModel, UserModal } from "./user.interface";
import bcrypt from "bcrypt";
import config from "../../../config";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const userSchema = new Schema<IUser, IUserModel>(
  {
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.USER,
    },
    activeRole: {
      type: String,
      enum: ["user", "seller"],
      default: "user",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    profileImage: {
      type: String,
      required: false,
      default: "",
    },

    dateOfBirth: {
      type: Date,
      required: false,
    },
    gender: {
      type: String,
      enum: Object.values(GENDER),
      default: GENDER.MALE,
    },
    password: {
      type: String,
      required: false,
      select: 0,
      minlength: 8,
    },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.ACTIVE,
    },
    phone: {
      type: String,
      required: true,
    },
    countryCode: {
      type: String,
      required: true,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
    },
    userName: {
      type: String,
      unique: true,
      sparse: true,
    },
    deviceToken: {
      type: String,
      required: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
        index: "2dsphere",
      },
      address: {
        type: String,
        default: "",
      },
    },
    stripeConnectedAccountId: {
      type: String,
      required: false,
    },
    stripeCustomerId: {
      type: String,
      required: false,
    },
    authentication: {
      type: {
        isResetPassword: {
          type: Boolean,
          default: false,
        },
        oneTimeCode: {
          type: Number,
          default: null,
        },
        expireAt: {
          type: Date,
          default: null,
        },
        authType: {
          type: String,
          default: null,
        },
      },
      select: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "inactive", "trialing", "past_due", "canceled", "none"],
      default: "none",
    },
    subscriptionPackageId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPackage",
      required: false,
    },
    stripeSubscriptionId: {
      type: String,
      required: false,
    },
    subscriptionExpiresAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.id;
        return ret;
      },
    },
  },
);

/* ================= PLUGIN ================= */
userSchema.plugin(softDeletePlugin);

//exist user check
userSchema.statics.isExistUserById = async (id: string) => {
  const isExist = await User.findById(id);
  return isExist;
};

userSchema.statics.isExistUserByEmail = async (email: string) => {
  const isExist = await User.findOne({ email });
  return isExist;
};

//account check
userSchema.statics.isAccountCreated = async (id: string) => {
  const isUserExist: any = await User.findById(id);
  return isUserExist.accountInformation.status;
};

//is match password
userSchema.statics.isMatchPassword = async (
  password: string,
  hashPassword: string,
): Promise<boolean> => {
  return await bcrypt.compare(password, hashPassword);
};

//check user
userSchema.pre("save", async function (next) {
  if (this.isNew) {
    // password hash
    if (this.password) {
      this.password = await bcrypt.hash(
        this.password,
        Number(config.bcrypt_salt_rounds),
      );
    }
  } else {
    if (this.isModified("password") && this.password) {
      this.password = await bcrypt.hash(
        this.password,
        Number(config.bcrypt_salt_rounds),
      );
    }
  }
  next();
});

export const User = model<IUser, IUserModel>("User", userSchema);
