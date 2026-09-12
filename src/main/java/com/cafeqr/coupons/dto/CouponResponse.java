package com.cafeqr.coupons.dto;

import com.cafeqr.coupons.domain.Coupon;
import com.cafeqr.coupons.domain.CouponItem;

import java.util.Comparator;
import java.util.List;

/**
 * A coupon as both screens read it: the owner's setup list, and the order pad after a code is
 * typed in. The pad needs the items and their percents so the discount can be shown on the
 * totals before the order is sent — the figure that actually gets charged is worked out again
 * on the server from these same numbers.
 */
public record CouponResponse(
        Long id,
        String code,
        String label,
        boolean active,
        List<Item> items
) {
    public record Item(Long menuItemId, int percentOff) {}

    public static CouponResponse from(Coupon c) {
        return new CouponResponse(c.getId(), c.getCode(), c.getLabel(), c.isActive(),
                c.getItems().stream()
                        .sorted(Comparator.comparing(CouponItem::getMenuItemId))
                        .map(i -> new Item(i.getMenuItemId(), i.getPercentOff()))
                        .toList());
    }
}
