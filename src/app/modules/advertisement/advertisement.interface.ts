import { Schema, Types } from "mongoose";
import { ISoftDeleteModel } from "../../../types/softDelete";
import {
  ADVERTISEMENT_STATUS,
  ADVERTISEMENT_TYPE,
} from "./advertisement.constant";
import { ICityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.interface";

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
  bannerImage?: string;
  featuredImage?: string;
  status: ADVERTISEMENT_STATUS;
  isDeleted?: boolean;
  deletedAt?: Date | null;
}

export type AdvertisementModel = ISoftDeleteModel<IAdvertisement>;
