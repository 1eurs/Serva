package com.cafeqr.subscriptions.dto;

import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CreateSubscriptionRequest(
        /** The tier this subscription buys — what the café is allowed to open, not a label. */
        @NotNull Plan tier,
        /** ONE_TIME for a single lifetime payment, or MONTHLY / YEARLY for recurring. */
        @NotNull BillingCycle billingCycle,
        /** Price per cycle, or the one-off amount when billingCycle = ONE_TIME. */
        @NotNull @DecimalMin("0.0") BigDecimal price,
        SubscriptionStatus status,
        LocalDate startDate,
        LocalDate endDate
) {}
