package com.cafeqr.reports;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * One shop's day, in the shape the one-page PDF needs — already scoped, already summed. The
 * money blocks ({@link #payments}, {@link #till}) are empty for a reader without the Payments
 * permission; {@link DailyReportHtml} simply drops the sections that have nothing to say.
 */
public record DailyReport(
        String shopName,
        String branchName,
        LocalDate date,
        Instant generatedAt,
        Sales sales,
        List<PayLine> payments,
        List<TillLine> till,
        List<MovementLine> cashMovements,
        List<ItemLine> bestSellers,
        List<HourLine> busyHours,
        List<StockLine> stock,
        List<LowStockLine> lowStock
) {
    /**
     * The headline: valid orders, what closed, what was lost, and the takings — each carrying its
     * change against the same weekday a week earlier. A delta is null when that day has no baseline
     * (no orders then, or the café is younger than a week), and the tile simply omits the arrow.
     */
    public record Sales(long orders, long completed, long cancelled,
                        BigDecimal revenue, BigDecimal averageOrderValue,
                        Double revenueDelta, Double ordersDelta) {}

    /** One payment method's slice of the day. */
    public record PayLine(String method, long count, BigDecimal revenue) {}

    /** One till session — closed sessions carry the reconciliation; an open one still runs. */
    public record TillLine(Instant openedAt, Instant closedAt, String openedBy, String closedBy,
                           BigDecimal openingFloat, BigDecimal cashSales, BigDecimal cardSales,
                           BigDecimal paidOut, BigDecimal paidIn,
                           BigDecimal expectedCash, BigDecimal countedCash, BigDecimal variance,
                           Integer orderCount, boolean open) {}

    /** One cash movement — money taken out of, or added to, the drawer, and the reason for it. */
    public record MovementLine(Instant at, String direction, BigDecimal amount, String note, String by) {}

    /** A best-selling menu item. */
    public record ItemLine(String name, long quantity, BigDecimal revenue) {}

    /** Orders taken in one hour of the day. */
    public record HourLine(int hour, long orders) {}

    /** How much a shelf item was drawn down over the day, in its own unit. */
    public record StockLine(String name, BigDecimal used, String unit) {}

    /** A shelf item at or below its reorder point — what to buy before tomorrow. */
    public record LowStockLine(String name, BigDecimal remaining, BigDecimal reorderPoint, String unit) {}
}
