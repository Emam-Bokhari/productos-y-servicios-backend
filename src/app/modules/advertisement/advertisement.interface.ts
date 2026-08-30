import { Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import {
  ADVERTISEMENT_STATUS,
  ADVERTISEMENT_TYPE,
} from "./advertisement.constant";

export interface IAdvertisement {
  sellerId: Types.ObjectId;
  storeId: Types.ObjectId;
  advertisementType: ADVERTISEMENT_TYPE;
  campaignName: string;
  cityAdConfigId: Types.ObjectId;
  country: string;
  countryCode: string;
  city: string;
  latitude: number;
  longitude: number;
  startDate: Date;
  endDate: Date;
  featuredImage?: string;
  status: ADVERTISEMENT_STATUS;
  price?: number;
  isDeleted?: boolean;
  deletedAt?: Date | null;
}

export type AdvertisementModel = ISoftDeleteModel<IAdvertisement>;
