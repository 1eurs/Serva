package com.cafeqr.coupons.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A code the counter can type on an order, and the items it discounts.
 *
 * <p>A café hands these out for its own reasons — the staff meal card, a code given to the
 * people next door, an apology for a cold flat white. None of that is modelled: the coupon is
 * just a code, a name to print, and a list of items each at its own percent off.
 */
@Entity
@Table(name = "coupons")
public class Coupon extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    /** Stored uppercase; see {@link com.cafeqr.coupons.CouponService#normalizeCode}. */
    @Column(name = "code", nullable = false, length = 24)
    private String code;

    /** What the receipt and the order card call this discount, e.g. "Staff meal". */
    @Column(name = "label", nullable = false, length = 80)
    private String label;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    /**
     * What the coupon covers. Empty means it covers nothing and so discounts nothing — the
     * setup screen refuses to save that, but an order must not blow up if one ever exists (a
     * menu item deleted out from under the last entry leaves exactly this).
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "coupon_items", joinColumns = @JoinColumn(name = "coupon_id"))
    private Set<CouponItem> items = new LinkedHashSet<>();

    public Long getRestaurantId() {
        return restaurantId;
    }

    public void setRestaurantId(Long restaurantId) {
        this.restaurantId = restaurantId;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Set<CouponItem> getItems() {
        return items;
    }

    public void setItems(Set<CouponItem> items) {
        this.items = items;
    }

    /** The percent off this coupon gives on a menu item, or {@code null} if it says nothing about it. */
    public Integer percentFor(Long menuItemId) {
        if (menuItemId == null) {
            return null;
        }
        for (CouponItem item : items) {
            if (menuItemId.equals(item.getMenuItemId())) {
                return item.getPercentOff();
            }
        }
        return null;
    }
}
