package com.cafeqr.branches.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Pause or resume customer ordering. This is the break in the middle of a shift, not the end
 * of the day — the till stays open, the counter keeps serving, and only the QR menu refuses.
 *
 * @param pauseMinutes how long the pause should last before it lifts itself. Null means until
 *                     somebody resumes, which is the pause that gets forgotten until a customer
 *                     asks why the menu won't take an order. Ignored when resuming.
 */
public record UpdateOrderingStatusRequest(
        @NotNull Boolean acceptingOrders,
        @Min(1) @Max(720) Integer pauseMinutes
) {}
