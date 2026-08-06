export enum TRANSACTION_TYPE {
  BOOKING_PAYMENT = "booking_payment",
  WALLET_TOPUP = "wallet_topup",
  REFUND = "refund",
  CANCELLATION_FEE = "cancellation_fee",
  CANCELLATION_COMPENSATION = "cancellation_compensation",
  PAYOUT = "payout",
  DRIVER_APPRECIATION = "driver_appreciation",
  LOST_FOUND_DELIVERY = "lost_found_delivery",
  USER_REFERRAL_REWARD = "user_referral_reward",
  DRIVER_REFERRAL_REWARD = "driver_referral_reward",
}

export enum PAYMENT_METHOD {
  CASH = "CASH",
  ONLINE = "ONLINE",
  WALLET = "WALLET",
}

export enum PAYMENT_STATUS {
  PENDING = "PENDING",
  PAID = "PAID",
  REFUNDED = "REFUNDED",
  FAILED = "FAILED",
}
