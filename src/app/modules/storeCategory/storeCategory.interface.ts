import { Schema } from "mongoose";
import { STATUS } from "../../../constants/status";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { CATEGORY_TYPE } from "./storeCategory.constant";

export type IStoreCategory = {
  name: string;
  description?: string;
  type: CATEGORY_TYPE;
  status: STATUS;
  parentId?: Schema.Types.ObjectId | null;
  subCategories?: IStoreCategory[];
};

export type StoreCategoryModel = ISoftDeleteModel<IStoreCategory>;
