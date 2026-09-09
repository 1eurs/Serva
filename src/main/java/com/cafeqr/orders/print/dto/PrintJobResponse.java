package com.cafeqr.orders.print.dto;

import com.cafeqr.orders.dto.OrderResponse;
import com.cafeqr.orders.print.domain.PrintJob;

import java.time.Instant;

/**
 * Carries the full order snapshot AND the café's receipt context, so a print station can
 * render and print from one pull with nothing else to ask for. That is what lets the station
 * be headless: it never has a page of its own to fetch café settings into.
 */
public record PrintJobResponse(
        Long id,
        Long orderId,
        Instant createdAt,
        OrderResponse order,
        ReceiptContext receipt
) {
    public static PrintJobResponse of(PrintJob job, OrderResponse order, ReceiptContext receipt) {
        return new PrintJobResponse(job.getId(), job.getOrderId(), job.getCreatedAt(), order, receipt);
    }
}
