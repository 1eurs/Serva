package com.cafeqr.stock.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * The Today tab: what a café actually needs at open. Deliberately three numbers and two short
 * lists — anything longer stops being read after the first week.
 */
public record StockOverviewResponse(
        Long branchId,
        int lowCount,
        int outCount,
        int endingTodayCount,
        /** Total value of what is on the shelves, at running average cost. */
        BigDecimal inventoryValue,
        /** Items at or below their reorder point. */
        List<StockItemResponse> low,
        /** Items with nothing left. */
        List<StockItemResponse> out,
        /** Projected to run out within a day at the recent rate. */
        List<CoverRow> endingToday,
        /** Menu items sold out right now, so the board can show what is 86'd. */
        List<SoldOutRow> soldOut
) {
    public record CoverRow(Long stockItemId, String nameEn, String nameAr, String baseUnit,
                           BigDecimal onHand, BigDecimal dailyUsage, BigDecimal daysLeft) {}

    /**
     * A menu item the customer cannot order right now.
     *
     * <p>{@code reason} is OUT_OF_STOCK or DAILY_LIMIT_REACHED, and for the first of those
     * {@code blockerName} is the single ingredient that did it — the owner's question is
     * never "which drinks are off?" on its own, it is "what do I buy to get them back?".
     */
    public record SoldOutRow(Long menuItemId, String nameEn, String nameAr, String reason,
                             Long blockerId, String blockerName) {}
}
