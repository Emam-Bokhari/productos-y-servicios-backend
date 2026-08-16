export const SUBSCRIPTION_PACKAGE_DURATION = {
  SEVEN_DAYS: "seven_days",
  ONE_MONTH: "one_month",
  THREE_MONTH: "three_month",
  SIX_MONTH: "six_month",
  ONE_YEAR: "one_year",
} as const;

export type SUBSCRIPTION_PACKAGE_DURATION =
  (typeof SUBSCRIPTION_PACKAGE_DURATION)[keyof typeof SUBSCRIPTION_PACKAGE_DURATION];

export const SUBSCRIPTION_PACKAGE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type SUBSCRIPTION_PACKAGE_STATUS =
  (typeof SUBSCRIPTION_PACKAGE_STATUS)[keyof typeof SUBSCRIPTION_PACKAGE_STATUS];

export const SUBSCRIPTION_PACKAGE_TYPE = {
  STORE_CREATION: "store_creation",
  POST_ADD: "post_add",
} as const;

export type SUBSCRIPTION_PACKAGE_TYPE =
  (typeof SUBSCRIPTION_PACKAGE_TYPE)[keyof typeof SUBSCRIPTION_PACKAGE_TYPE];
