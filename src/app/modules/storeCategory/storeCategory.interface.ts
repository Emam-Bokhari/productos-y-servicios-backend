import { STATUS } from "../../../constants/status";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { CATEGORY_TYPE } from "./storeCategory.constant";

export type IStoreCategory = {
  name: string;
  description?: string;
  type: CATEGORY_TYPE;
  status: STATUS;
};

export type StoreCategoryModel = ISoftDeleteModel<IStoreCategory>;
