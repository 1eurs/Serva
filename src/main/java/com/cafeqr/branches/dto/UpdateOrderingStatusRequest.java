package com.cafeqr.branches.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Pause or resume customer ordering. This is the break in the middle of a shift, not the end
 * of the day — the till stays open, the counter keeps serving, and only the QR menu refuses.
 */
public record UpdateOrderingStatusRequest(
        @NotNull Boolean acceptingOrders
) {}
