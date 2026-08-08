import { Schema } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { STORE_STATUS, STORE_TYPE } from "./store.constant";

export type IStore = {
  owner: Schema.Types.ObjectId;
  storeType?: STORE_TYPE;
  displayName?: string;
  description?: string;
  categoryId?: Schema.Types.ObjectId;
  logo?: string;
  coverImage?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  businessLicenseNumber?: string;
  tradeLicenseImage?: string;
  tinNumber?: string;
  status: STORE_STATUS;
};

export type StoreModel = ISoftDeleteModel<IStore>;
