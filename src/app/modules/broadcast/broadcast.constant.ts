export enum BROADCAST_DELIVERY_TYPE {
  IMMEDIATE = "immediate",
  SCHEDULED = "scheduled",
}

export enum BROADCAST_TYPE {
  SERVICE_ALERT = "service_alert",
  WEATHER_ALERT = "weather_alert",
  SURGE_OPPORTUNITY = "surge_opportunity",
  MAINTENANCE = "maintenance",
  AIRPORT_NOTICE = "airport_notice",
  EMERGENCY_ALERT = "emergency_alert",
  PLATFORM_UPDATE = "platform_update",
}

export enum BROADCAST_TARGET {
  ALL_DRIVERS = "all_drivers",
  ALL_PASSENGERS = "all_passengers",
  BY_CITY = "by_city",
  BY_STATE = "by_state",
  BY_TIER = "by_tier",
}

export enum BROADCAST_STATUS {
  PENDING = "pending",
  SCHEDULED = "scheduled",
  SENT = "sent",
}
