package com.cafeqr.subscriptions.dto;

import com.cafeqr.subscriptions.domain.PaymentMethod;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Records money received against a subscription.
 *
 * <p>{@code extendTerm} is what separates "we got paid" from "the café keeps working": with it
 * the term rolls forward by one billing cycle and the subscription goes ACTIVE. Without it the
 * payment is filed but the dates are left alone — the right behaviour for a part payment, a
 * setup fee, or a correction.
 */
public record RecordPaymentRequest(
        /** Negative is legal — that is how a refund or a correction is filed. */
        @NotNull BigDecimal amount,
        PaymentMethod method,
        @Size(max = 120) String reference,
        /** When the money moved. Defaults to today. */
        LocalDate paidOn,
        @Size(max = 500) String note,
        /** Roll the term forward by one cycle and mark the subscription ACTIVE. Defaults to true. */
        Boolean extendTerm
) {}
