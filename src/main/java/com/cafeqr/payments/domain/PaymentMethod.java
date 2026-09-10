package com.cafeqr.payments.domain;

/**
 * How a payment was taken. Most cafe orders are settled in person, so {@link #CARD} (POS terminal)
 * and {@link #CASH} are the common cases; {@link #ONLINE} is reserved for a future gateway.
 *
 * <p>{@link #SPLIT} is an order-level answer only: it means the bill was settled by several
 * people who did not all pay the same way, so no single method describes it. The payment rows
 * underneath always carry the real method each person handed over — that is what the cash
 * drawer is counted against.
 */
public enum PaymentMethod {
    CASH,
    CARD,
    ONLINE,
    OTHER,
    SPLIT
}
