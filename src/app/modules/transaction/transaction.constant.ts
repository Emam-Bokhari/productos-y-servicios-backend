export enum TRANSACTION_TYPE {
  SUBSCRIPTION_PAYMENT = "subscription_payment",
  ADVERTISEMENT_PAYMENT = "advertisement_payment",
  SUBSCRIPTION_RENEWAL = "subscription_renewal",
  REFUND = "refund",
}

export enum PAYMENT_METHOD {
  DATAFAST = "DATAFAST",
}

export enum PAYMENT_STATUS {
  PENDING = "PENDING",
  PAID = "PAID",
  REFUNDED = "REFUNDED",
  FAILED = "FAILED",
}
