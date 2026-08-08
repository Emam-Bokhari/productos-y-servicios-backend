export const CATEGORY_TYPE = {
  PRODUCT: "product",
  SERVICE: "service",
} as const;
export type CATEGORY_TYPE = (typeof CATEGORY_TYPE)[keyof typeof CATEGORY_TYPE];
