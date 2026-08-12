package com.cafeqr.stock.domain;

/**
 * Why stock was written off. Staff meals and comps are a large hidden cost bucket in every
 * café, so they get first-class reasons rather than disappearing into a free-text note —
 * the waste report is only actionable if these are separable.
 */
public enum WasteReason {
    SPILLED,
    EXPIRED,
    STAFF_MEAL,
    COMP,
    TRAINING,
    DAMAGED,
    OTHER
}
