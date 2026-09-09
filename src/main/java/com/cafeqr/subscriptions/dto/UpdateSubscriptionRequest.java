package com.cafeqr.subscriptions.dto;

import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import jakarta.validation.constraints.DecimalMin;

import java.math.BigDecimal;
import java.time.LocalDate;

public record UpdateSubscriptionRequest(
        /** Changing this changes what the café can open, the moment it is saved. */
        Plan tier,
        BillingCycle billingCycle,
        @DecimalMin("0.0") BigDecimal price,
        SubscriptionStatus status,
        LocalDate startDate,
        LocalDate endDate
) {}
