package com.cafeqr.stock.domain;

/** Why a {@link StockMovement} happened. Signed direction is carried by the delta, not by this. */
public enum MovementReason {
    /** A delivery arrived. Positive; updates the item's rolling average cost. */
    RECEIVE,
    /** Consumed by an accepted order. Negative; unique per (order, item) so it can't double-deduct. */
    SALE,
    /** Thrown away / given away. Negative; carries a {@link WasteReason}. */
    WASTE,
    /** A physical count corrected the balance. Signed by the variance. */
    COUNT,
    /** Arrived from another branch. Positive. */
    TRANSFER_IN,
    /** Sent to another branch. Negative. */
    TRANSFER_OUT,
    /** Hand-typed correction with a note. Signed. */
    MANUAL,
    /** An accepted order was cancelled and its consumption was given back. Positive. */
    ORDER_RESTORE,
    /** A batch of a PREP item was produced. Positive on the prep item. */
    PREP_PRODUCE,
    /** Ingredients drawn to produce a PREP batch. Negative on each input. */
    PREP_CONSUME
}
