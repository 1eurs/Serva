package com.cafeqr.analytics.dto;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Per-restaurant health snapshot for the platform admin console.
 *
 * <p>Beyond volume it carries the pieces the console needs to answer two questions no single
 * order count can: <em>is this café finished being set up</em> ({@code owners}, {@code tables},
 * {@code branches}, {@code menuItems} — the activation checklist) and <em>is it slipping away</em>
 * ({@code orders7d} against {@code ordersPrev7d}).
 */
public record RestaurantStatsResponse(
        Long restaurantId,
        long ordersToday,
        long orders30d,
        BigDecimal revenue30d,
        long ordersTotal,
        Instant lastOrderAt,
        long branches,
        long menuItems,
        long owners,
        long tables,
        long orders7d,
        long ordersPrev7d
) {
    /** A café with nothing on the board yet — still gets a row so it can't hide from the console. */
    public static RestaurantStatsResponse empty(Long restaurantId, long branches, long menuItems,
                                                long owners, long tables) {
        return new RestaurantStatsResponse(restaurantId, 0, 0, BigDecimal.ZERO, 0, null,
                branches, menuItems, owners, tables, 0, 0);
    }
}
