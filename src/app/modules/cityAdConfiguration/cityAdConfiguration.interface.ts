import { ISoftDeleteModel } from "../../../types/softDelete";
import { SLOT_CONFIG_STATUS } from "./cityAdConfiguration.constant";

export interface ICityAdConfiguration {
  country: string;
  countryCode: string;
  city: string;
  latitude: number;
  longitude: number;
  bannerCapacity: number;
  featuredCapacity: number;
  bannerEnabled: boolean;
  featuredEnabled: boolean;
  status: SLOT_CONFIG_STATUS;
  lockVersion: number;
  isDeleted?: boolean;
  deletedAt?: Date | null;
}

export type CityAdConfigurationModel = ISoftDeleteModel<ICityAdConfiguration>;
