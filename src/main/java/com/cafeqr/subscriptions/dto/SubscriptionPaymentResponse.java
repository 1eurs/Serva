package com.cafeqr.subscriptions.dto;

import com.cafeqr.subscriptions.domain.PaymentMethod;
import com.cafeqr.subscriptions.domain.SubscriptionPayment;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public record SubscriptionPaymentResponse(
        Long id,
        Long subscriptionId,
        Long restaurantId,
        BigDecimal amount,
        PaymentMethod method,
        String reference,
        LocalDate paidOn,
        LocalDate coversUntil,
        String note,
        Long recordedBy,
        Instant createdAt
) {
    public static SubscriptionPaymentResponse from(SubscriptionPayment p) {
        return new SubscriptionPaymentResponse(
                p.getId(), p.getSubscriptionId(), p.getRestaurantId(), p.getAmount(), p.getMethod(),
                p.getReference(), p.getPaidOn(), p.getCoversUntil(), p.getNote(), p.getRecordedBy(),
                p.getCreatedAt());
    }
}
