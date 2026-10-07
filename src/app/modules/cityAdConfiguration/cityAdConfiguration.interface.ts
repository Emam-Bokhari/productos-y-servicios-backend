import { ISoftDeleteModel } from "../../../types/softDelete";
import { SLOT_CONFIG_STATUS } from "./cityAdConfiguration.constant";

export interface IPositionPricing {
  position: number;
  price: number;
  durationDays?: number;
}

export interface ICityAdConfiguration {
  country: string;
  countryCode: string;
  province: string;
  city: string;
  canton?: string;
  sector: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  featuredCapacity: number;
  featuredEnabled: boolean;
  featuredDurationDays: number;
  featuredPositionPricing?: IPositionPricing[];
  defaultFeaturedImage?: string;
  status: SLOT_CONFIG_STATUS;
  lockVersion: number;
  isDeleted?: boolean;
  deletedAt?: Date | null;
}

export type CityAdConfigurationModel = ISoftDeleteModel<ICityAdConfiguration>;
