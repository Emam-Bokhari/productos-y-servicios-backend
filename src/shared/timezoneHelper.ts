import { DateTime } from "luxon";

/**
 * Timezone Helper Utility
 * Provides centralized timezone-aware date/time operations using Luxon
 * All times are stored in UTC in the database
 */

/**
 * Convert UTC date to a specific timezone
 * @param utcDate - UTC Date object or ISO string
 * @param timezone - IANA timezone identifier (e.g., "Asia/Dhaka")
 * @returns DateTime in the specified timezone
 */
export const utcToTimezone = (
  utcDate: Date | string,
  timezone: string,
): DateTime => {
  return DateTime.fromJSDate(new Date(utcDate)).setZone(timezone);
};

/**
 * Format ride schedule info (rideType, scheduledAt, scheduledAtUtc, timezone) for socket events and responses
 * @param ride - Ride document or object containing rideType, scheduledAt, timezone
 * @returns Object with ride schedule fields
 */
export const getRideScheduleInfo = (ride: any) => {
  if (!ride) return {};

  const scheduledAtDisplay =
    ride.timezone && ride.scheduledAt
      ? utcToTimezone(ride.scheduledAt, ride.timezone).toISO()
      : ride.scheduledAt || null;

  return {
    rideType: ride.rideType || "instant",
    scheduledAt: scheduledAtDisplay,
    scheduledAtUtc: ride.scheduledAt || null,
    timezone: ride.timezone || null,
  };
};

/**
 * Get current time in a specific timezone
 * @param timezone - IANA timezone identifier (e.g., "Asia/Dhaka")
 * @returns Current DateTime in the specified timezone
 */
export const getCurrentTimeInTimezone = (timezone: string): DateTime => {
  return DateTime.now().setZone(timezone);
};

/**
 * Convert local time in a timezone to UTC
 * @param localDate - Date in the local timezone
 * @param timezone - IANA timezone identifier (e.g., "Asia/Dhaka")
 * @returns DateTime in UTC
 */
export const timezoneToUtc = (
  localDate: Date | string,
  timezone: string,
): DateTime => {
  return DateTime.fromJSDate(new Date(localDate), { zone: timezone }).setZone(
    "UTC",
  );
};

/**
 * Check if current UTC time falls within a peak hour window in a specific timezone
 * Handles overnight time ranges (e.g., 22:00 - 02:00)
 * @param startTime - Start time in HH:mm format (e.g., "08:00")
 * @param endTime - End time in HH:mm format (e.g., "10:00")
 * @param timezone - IANA timezone identifier (e.g., "Asia/Dhaka")
 * @param applicableDays - Array of applicable day names in lowercase (e.g., ["monday", "tuesday"])
 * @returns true if current time is within the peak hour window
 */
export const isPeakHourActive = (
  startTime: string,
  endTime: string,
  timezone: string,
  applicableDays: string[],
): boolean => {
  const nowInTimezone = getCurrentTimeInTimezone(timezone);
  const currentDayName = nowInTimezone.toFormat("EEEE").toLowerCase(); // Full day name in lowercase (e.g., "monday")
  const currentTimeStr = nowInTimezone.toFormat("HH:mm");

  // Check if current day is applicable
  if (!applicableDays.includes(currentDayName)) {
    return false;
  }

  // Handle overnight time ranges (e.g., 22:00 - 02:00)
  if (startTime > endTime) {
    // Time range crosses midnight
    return currentTimeStr >= startTime || currentTimeStr <= endTime;
  } else {
    // Normal time range within same day
    return currentTimeStr >= startTime && currentTimeStr <= endTime;
  }
};

/**
 * Check if current UTC date falls within a holiday date range in a specific timezone
 * @param startDateTime - Start datetime in UTC
 * @param endDateTime - End datetime in UTC
 * @param timezone - IANA timezone identifier (e.g., "Asia/Dhaka")
 * @returns true if current date is within the holiday range
 */
export const isHolidayActive = (
  startDateTime: Date | string,
  endDateTime: Date | string,
  timezone: string,
): boolean => {
  const nowInTimezone = getCurrentTimeInTimezone(timezone);
  const startInTimezone = utcToTimezone(startDateTime, timezone).startOf("day");
  const endInTimezone = utcToTimezone(endDateTime, timezone).endOf("day");
  const nowStartOfDay = nowInTimezone.startOf("day");

  return nowStartOfDay >= startInTimezone && nowStartOfDay <= endInTimezone;
};

/**
 * Check if current UTC datetime falls within an event datetime range in a specific timezone
 * @param startDateTime - Start datetime in UTC
 * @param endDateTime - End datetime in UTC
 * @param timezone - IANA timezone identifier (e.g., "Asia/Dhaka")
 * @returns true if current datetime is within the event range
 */
export const isEventActive = (
  startDateTime: Date | string,
  endDateTime: Date | string,
  timezone: string,
): boolean => {
  const nowInTimezone = getCurrentTimeInTimezone(timezone);
  const startInTimezone = utcToTimezone(startDateTime, timezone);
  const endInTimezone = utcToTimezone(endDateTime, timezone);

  return nowInTimezone >= startInTimezone && nowInTimezone <= endInTimezone;
};

/**
 * Validate IANA timezone identifier
 * @param timezone - Timezone string to validate
 * @returns true if valid IANA timezone
 */
export const isValidTimezone = (timezone: string): boolean => {
  try {
    return DateTime.now().setZone(timezone).isValid;
  } catch {
    return false;
  }
};

/**
 * Get list of common IANA timezones (for validation/dropdown)
 * @returns Array of common timezone identifiers
 */
export const getCommonTimezones = (): string[] => {
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Dhaka",
    "Asia/Singapore",
    "Asia/Hong_Kong",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Sydney",
    "Australia/Melbourne",
  ];
};

/**
 * Get start and end of day in a specific timezone, returned as UTC Date objects
 * @param dateStr - Optional date query (e.g. "today", "yesterday", or a specific date/ISO string)
 * @param timezone - IANA timezone identifier
 */
export const getDayRangeInTimezone = (
  dateStr: "today" | "yesterday" | string | Date,
  timezone: string,
): { start: Date; end: Date } => {
  let targetDateTime = DateTime.now().setZone(timezone);

  if (dateStr === "yesterday") {
    targetDateTime = targetDateTime.minus({ days: 1 });
  } else if (dateStr !== "today") {
    // Avoid double instantiation if already a Date object
    const jsDate = dateStr instanceof Date ? dateStr : new Date(dateStr);
    const parsed = DateTime.fromJSDate(jsDate).setZone(timezone);
    if (parsed.isValid) {
      targetDateTime = parsed;
    }
  }

  const start = targetDateTime.startOf("day").toUTC().toJSDate();
  const end = targetDateTime.endOf("day").toUTC().toJSDate();

  return { start, end };
};
