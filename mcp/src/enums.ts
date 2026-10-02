// Enum vocabularies mirrored from the backend, so tool schemas match what the API accepts.

export const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "POS", "OTHER"] as const;
export const ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
] as const;
export const ORDER_TYPES = ["DINE_IN", "CAR"] as const;
export const STOCK_UNITS = ["KG", "ML", "ONE", "PIECE", "THOUSAND", "THOUSANDTH"] as const;
export const DISCOUNT_TYPES = ["NONE", "PERCENT", "FIXED"] as const;
// Everything an owner can grant a staff member (PLATFORM_ADMIN and the deprecated BILLING excluded).
export const STAFF_PERMISSIONS = [
  "ORDERS",
  "PAYMENTS",
  "MENU",
  "QR_TABLES",
  "TEAM",
  "ANALYTICS",
  "PROFILE",
  "BRANCHES",
  "STOCK",
] as const;
