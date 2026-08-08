export const ADVERTISEMENT_TYPE = {
  BANNER: "banner",
  FEATURED: "featured",
} as const;

export type ADVERTISEMENT_TYPE =
  (typeof ADVERTISEMENT_TYPE)[keyof typeof ADVERTISEMENT_TYPE];

export const ADVERTISEMENT_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export type ADVERTISEMENT_STATUS =
  (typeof ADVERTISEMENT_STATUS)[keyof typeof ADVERTISEMENT_STATUS];

export { SLOT_CONFIG_STATUS } from "../cityAdConfiguration/cityAdConfiguration.constant";
