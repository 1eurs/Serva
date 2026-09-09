package com.cafeqr.subscriptions.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * The whole billing picture in one response: the money totals across the top, the counts that
 * decide which queue a café sits in, and every billing line to render underneath.
 */
public record BillingOverviewResponse(
        /** Recurring revenue per month, counting only subscriptions that are currently live. */
        BigDecimal mrr,
        BigDecimal arr,
        BigDecimal collectedThisMonth,
        BigDecimal collectedLastMonth,
        /** What overdue cafés owe, at their own price — the number worth chasing today. */
        BigDecimal outstanding,
        long activeCount,
        long trialCount,
        long pastDueCount,
        long expiredCount,
        long cancelledCount,
        /** Live subscriptions whose term ends within a fortnight. */
        long expiringSoonCount,
        List<BillingRow> rows
) {}
