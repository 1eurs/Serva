package com.cafeqr.coupons.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.util.Objects;

/**
 * One line of a coupon: a menu item and how much of its price the coupon takes off.
 *
 * <p>{@code percentOff} is a whole percent, 1..100, and 100 means the item is free. A percent
 * rather than an amount because the coupon outlives the price list — the owner raises the price
 * of a latte and "staff coffee is free" keeps being true without anyone editing a coupon.
 *
 * <p>{@code percentOff} is part of equality on purpose. Hibernate works out what to delete and
 * insert in an element collection by comparing elements, so a set that considered two entries
 * for the same item equal whatever their percent would let "half price becomes free" save
 * silently as no change at all.
 */
@Embeddable
public class CouponItem {

    @Column(name = "menu_item_id", nullable = false)
    private Long menuItemId;

    @Column(name = "percent_off", nullable = false)
    private int percentOff;

    protected CouponItem() {
    }

    public CouponItem(Long menuItemId, int percentOff) {
        this.menuItemId = menuItemId;
        this.percentOff = percentOff;
    }

    public Long getMenuItemId() {
        return menuItemId;
    }

    public int getPercentOff() {
        return percentOff;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof CouponItem other)) {
            return false;
        }
        return percentOff == other.percentOff && Objects.equals(menuItemId, other.menuItemId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(menuItemId, percentOff);
    }
}
