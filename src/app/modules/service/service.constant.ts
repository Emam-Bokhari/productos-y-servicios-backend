export const SERVICE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type SERVICE_STATUS =
  (typeof SERVICE_STATUS)[keyof typeof SERVICE_STATUS];

export const SERVICE_SEARCHABLE_FIELDS = ["title", "description"];
