package com.cafeqr.analytics.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record AnalyticsSummaryResponse(
        Instant from,
        Instant to,
        long totalOrders,
        long pendingOrders,
        long acceptedOrders,
        long declinedOrders,
        long preparingOrders,
        long readyOrders,
        long completedOrders,
        long cancelledOrders,
        BigDecimal totalRevenue,
        BigDecimal averageOrderValue,
        long uncollectedOrders,
        BigDecimal uncollectedAmount,
        /** Collected revenue from items customers added via the cart's "goes well with" upsell. */
        BigDecimal suggestionRevenue,
        List<BestSellingItem> bestSellingItems,
        List<HourlyCount> busiestHours
) {}
