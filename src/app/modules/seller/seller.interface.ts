import { Schema } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { STATUS } from "../../../constants/status";

export type ISeller = {
  user: Schema.Types.ObjectId;
  store: Schema.Types.ObjectId;
  status: STATUS;
};

export type SellerModel = ISoftDeleteModel<ISeller>;
