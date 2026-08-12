package com.cafeqr.stock.domain;

/**
 * How often an item should come up in the cycle-count rotation. Espresso beans are worth
 * counting daily; napkins are not worth counting at all (leave it null). Rotating a small
 * subset gets far better adherence than a monthly count of everything.
 */
public enum CountFrequency {
    DAILY(1),
    WEEKLY(7),
    MONTHLY(30);

    private final int days;

    CountFrequency(int days) {
        this.days = days;
    }

    public int days() {
        return days;
    }
}
