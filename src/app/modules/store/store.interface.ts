import { Schema } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import { STORE_STATUS, STORE_TYPE, DOCUMENT_TYPE } from "./store.constant";

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
  tradeLicense?: string;
  tinNumber?: string;
  status: STORE_STATUS;
  documentType?: DOCUMENT_TYPE;
  documentFront?: string;
  documentBack?: string;
  isVerified?: boolean;
  visitorCount?: number;
  averageRating?: number;
  ratingCount?: number;
};

export type StoreModel = ISoftDeleteModel<IStore>;
