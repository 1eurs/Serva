package com.cafeqr.stock.domain;

/**
 * How much inventory tracking a menu item opts into. Deliberately an effort ladder: a vendor
 * climbs only as far as they want, and every rung is useful on its own.
 */
public enum StockMode {
    /** Nothing tracked. The default for every item. */
    NONE,
    /** "Only 12 cheesecakes today" — a per-day cap that auto-resets. No counting, no recipes. */
    DAILY_LIMIT,
    /** A countable good: one sale draws 1 from the backing stock item. */
    SIMPLE,
    /** Made from ingredients: consumption comes from the item's recipe lines. */
    RECIPE;

    /** True when selling this item moves the stock ledger (SIMPLE and RECIPE both do). */
    public boolean consumesStock() {
        return this == SIMPLE || this == RECIPE;
    }
}
