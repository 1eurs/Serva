package com.cafeqr.stock.domain;

/** Lifecycle of a purchase order. Receiving lines moves it PARTIAL -> RECEIVED automatically. */
public enum PurchaseOrderStatus {
    DRAFT,
    SENT,
    PARTIAL,
    RECEIVED,
    CANCELLED;

    public boolean isOpen() {
        return this == DRAFT || this == SENT || this == PARTIAL;
    }
}
