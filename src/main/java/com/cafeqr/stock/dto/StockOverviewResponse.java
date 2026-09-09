package com.cafeqr.stock.dto;

import java.math.BigDecimal;
import java.time.Instant;
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
        List<SoldOutRow> soldOut,
        /** How far this branch has actually got with stock. See {@link Readiness}. */
        Readiness readiness
) {
    /**
     * Whether the feature is switched on, in the only terms that matter.
     *
     * <p>Stock is a loop with three joints — what you buy, what is on the shelf, what a sale
     * takes — and it produces nothing until all three are connected. The page could infer the
     * first two by walking the item list, but not the third thing an owner needs to be told:
     * <em>when</em> anybody last looked at a shelf. A page that cannot say that ends up
     * reporting yesterday's numbers in the present tense, which is how owners stop believing
     * it. Counted-at is the evidence behind every figure on the screen.
     */
    public record Readiness(
            /** Items on the shelf list, archived ones excluded. */
            int items,
            /** How many of those this branch has ever recorded a figure for. */
            int counted,
            /** The last time anybody counted anything here, or null if nobody ever has. */
            Instant lastCountAt) {}

    public record CoverRow(Long stockItemId, String nameEn, String nameAr, String baseUnit,
                           BigDecimal onHand, BigDecimal dailyUsage, BigDecimal daysLeft) {}

    /**
     * A menu item the customer cannot order right now.
     *
     * <p>{@code reason} is OUT_OF_STOCK or DAILY_LIMIT_REACHED, and for the first of those
     * the blocker is the single ingredient that did it — the owner's question is never
     * "which drinks are off?" on its own, it is "what do I buy to get them back?".
     *
     * <p>It carries both of the blocker's names so the strip can render in one language.
     */
    public record SoldOutRow(Long menuItemId, String nameEn, String nameAr, String reason,
                             Long blockerId, String blockerNameEn, String blockerNameAr) {}
}
