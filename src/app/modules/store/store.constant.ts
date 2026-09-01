export const STORE_STATUS = {
  UNDER_REVIEW: "under_review",
  ACTIVE: "active",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
} as const;

export type STORE_STATUS = (typeof STORE_STATUS)[keyof typeof STORE_STATUS];

export const STORE_TYPE = {
  PRODUCT_STORE: "product_store",
  SERVICE_STORE: "service_store",
} as const;

export type STORE_TYPE = (typeof STORE_TYPE)[keyof typeof STORE_TYPE];

export const DOCUMENT_TYPE = {
  NID: "nid",
  PASSPORT: "passport",
} as const;

export type DOCUMENT_TYPE = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];
