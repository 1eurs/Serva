package com.cafeqr.audit.domain;

/**
 * The verbs the audit log records. Kept as constants rather than an enum so a new action can
 * be logged without a migration, while the console still has a stable list to translate.
 */
public final class AuditAction {

    public static final String CAFE_CREATED = "CAFE_CREATED";
    public static final String CAFE_ACTIVATED = "CAFE_ACTIVATED";
    public static final String CAFE_DEACTIVATED = "CAFE_DEACTIVATED";
    public static final String CAFE_RENEWED = "CAFE_RENEWED";
    /** A café moved tier — recorded against the café. */
    public static final String PLAN_CHANGED = "PLAN_CHANGED";
    /** A tier gained or lost a feature — recorded against the tier, and it moves every café on it. */
    public static final String PLAN_FEATURES_CHANGED = "PLAN_FEATURES_CHANGED";
    /** A tier's list price moved — recorded against the tier, and it repriced every café on it. */
    public static final String PLAN_PRICE_CHANGED = "PLAN_PRICE_CHANGED";
    public static final String LEAD_CONVERTED = "LEAD_CONVERTED";
    public static final String SUBSCRIPTION_CHANGED = "SUBSCRIPTION_CHANGED";
    public static final String PAYMENT_RECORDED = "PAYMENT_RECORDED";
    public static final String PASSWORD_RESET = "PASSWORD_RESET";
    public static final String USER_DEACTIVATED = "USER_DEACTIVATED";
    public static final String USER_ACTIVATED = "USER_ACTIVATED";
    public static final String IMPERSONATED = "IMPERSONATED";
    public static final String BROADCAST_SENT = "BROADCAST_SENT";
    public static final String MENU_IMPORTED = "MENU_IMPORTED";

    private AuditAction() {}
}
