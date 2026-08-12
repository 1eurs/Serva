package com.cafeqr.stock.dto;

import java.math.BigDecimal;

/** The reports that earn the data entry. */
public final class InsightResponses {

    private InsightResponses() {
    }

    public record Cover(Long stockItemId, String nameEn, String nameAr, String baseUnit,
                        BigDecimal onHand, BigDecimal dailyUsage, BigDecimal daysLeft) {}

    public record Waste(Long stockItemId, String nameEn, String nameAr, String baseUnit,
                        BigDecimal quantityBase, BigDecimal value) {}

    /** "Beans up 12% — your latte margin just moved." */
    public record CostDrift(Long stockItemId, String nameEn, String nameAr,
                            BigDecimal averageCost, BigDecimal latestCost, BigDecimal changePercent) {}

    /** One dish on the popularity-vs-margin map: STAR | PLOWHORSE | PUZZLE | DOG. */
    public record MenuEconomics(Long menuItemId, String nameEn, String nameAr, long quantitySold,
                                BigDecimal revenue, BigDecimal unitCost, BigDecimal unitMargin,
                                BigDecimal foodCostPercent, String quadrant) {}
}
