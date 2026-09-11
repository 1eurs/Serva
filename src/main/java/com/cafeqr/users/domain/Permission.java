package com.cafeqr.users.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Granular access a user account may hold. Replaces the old fixed role hierarchy: an owner now
 * toggles exactly which areas a staff member can reach. Spring Security authorities are the enum
 * name verbatim (no {@code ROLE_} prefix), so guards read {@code hasAuthority('MENU')}.
 */
public enum Permission {
    /** Cross-tenant superuser (platform staff; {@code restaurantId == null}). */
    PLATFORM_ADMIN,
    /** Live board + all order actions (accept / decline / advance / complete / cancel). Was split from
     *  the old KITCHEN tier — they're one and the same now. Payments gate separately. */
    ORDERS,
    /** Take payment / mark an order paid. */
    PAYMENTS,
    /** Menu items + look / theme. */
    MENU,
    /** Tables & QR codes. */
    QR_TABLES,
    /** Manage staff accounts. */
    TEAM,
    /** Dashboard insights. */
    ANALYTICS,
    /** Restaurant profile / settings. */
    PROFILE,
    /** Create / manage branches (add, rename, activate / deactivate). */
    BRANCHES,
    /**
     * @deprecated Reserved, not enforced anywhere. Subscription viewing is gated by {@link #PROFILE}
     * and platform billing by {@link #PLATFORM_ADMIN}, so granting this to staff does nothing. Kept
     * only so existing {@code user_permissions} rows (backfilled in V19) still deserialize; no new
     * account is granted it and it is hidden from the staff editor.
     */
    @Deprecated
    BILLING;

    /** Every permission an owner gets: full control of their restaurant, but not the platform. */
    public static Set<Permission> ownerSet() {
        return EnumSet.of(ORDERS, PAYMENTS, MENU, QR_TABLES, TEAM, ANALYTICS, PROFILE, BRANCHES);
    }

    /** Everything, including platform-wide control — for platform admins. */
    public static Set<Permission> platformAdminSet() {
        Set<Permission> all = EnumSet.allOf(Permission.class);
        return all;
    }
}
