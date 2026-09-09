package com.cafeqr.subscriptions.dto;

import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * One café's billing line for the platform board — the subscription plus enough of the café
 * to name it and act on it, so the board renders from a single request.
 */
public record BillingRow(
        Long subscriptionId,
        Long restaurantId,
        String name,
        String nameEn,
        String nameAr,
        String slug,
        boolean restaurantActive,
        /** The café's tier. Was carried here twice — once as this enum off the café, once as
         *  the subscription's free-text name — which is precisely how the two drifted. */
        Plan tier,
        BillingCycle billingCycle,
        BigDecimal price,
        /** Price normalised to a month, so a yearly and a monthly café can be added together. */
        BigDecimal monthlyValue,
        SubscriptionStatus status,
        LocalDate startDate,
        LocalDate endDate,
        /** Days until the term ends; negative means overdue, null for lifetime access. */
        Integer daysLeft,
        String paymentReference,
        Instant paymentConfirmedAt,
        LocalDate lastPaidOn,
        BigDecimal paidTotal
) {}
