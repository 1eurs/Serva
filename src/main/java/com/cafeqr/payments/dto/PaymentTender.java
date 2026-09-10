package com.cafeqr.payments.dto;

import com.cafeqr.payments.domain.PaymentMethod;

import java.math.BigDecimal;

/**
 * One person's share of a split bill: what they paid and how. The counter divides the bill on
 * the tablet, so the shares arrive already worked out and must add up to the order total exactly
 * — see {@link com.cafeqr.payments.PaymentService#settleSplit}.
 */
public record PaymentTender(
        PaymentMethod method,
        BigDecimal amount
) {}
