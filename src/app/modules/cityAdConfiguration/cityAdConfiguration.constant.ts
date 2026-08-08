export const SLOT_CONFIG_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type SLOT_CONFIG_STATUS =
  (typeof SLOT_CONFIG_STATUS)[keyof typeof SLOT_CONFIG_STATUS];
