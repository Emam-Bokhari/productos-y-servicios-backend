export enum REPORT_TYPE {
  STORE = "store",
  USER = "user",
}

export enum REPORT_STATUS {
  PENDING = "pending",
  UNDER_REVIEW = "under_review",
  RESOLVED = "resolved",
  DISMISSED = "dismissed",
}

export enum REPORT_ACTION_TAKEN {
  NONE = "none",
  WARNING_ISSUED = "warning_issued",
  STORE_SUSPENDED = "store_suspended",
  USER_BLOCKED = "user_blocked",
  CONTENT_REMOVED = "content_removed",
  DISMISSED_NO_VIOLATION = "dismissed_no_violation",
  OTHER = "other",
}

export enum REPORT_REASON {
  INAPPROPRIATE_CONTENT = "inappropriate_content",
  FRAUDULENT_ACTIVITY = "fraudulent_activity",
  ABUSIVE_BEHAVIOR = "abusive_behavior",
  SCAM_OR_SPAM = "scam_or_spam",
  COUNTERFEIT_OR_ILLEGAL = "counterfeit_or_illegal",
  HARASSMENT = "harassment",
  FALSE_INFORMATION = "false_information",
  OTHER = "other",
}

export const REPORT_REASONS = Object.values(REPORT_REASON);

export const REPORT_SEARCHABLE_FIELDS = [
  "reason",
  "description",
  "adminNotes",
  "actionTaken",
];