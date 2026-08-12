package com.cafeqr.stock.domain;

/** Lifecycle of a physical count. Closing it posts the COUNT movements. */
public enum StocktakeStatus {
    OPEN,
    CLOSED,
    CANCELLED
}
