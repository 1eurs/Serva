package com.cafeqr.payments.dto;

import java.util.List;

/** Settles one order with several tenders at once — a bill split between the people at the table. */
public record SplitPaymentRequest(
        List<PaymentTender> tenders
) {}
