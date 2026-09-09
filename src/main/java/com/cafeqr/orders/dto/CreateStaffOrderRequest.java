package com.cafeqr.orders.dto;

import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.payments.domain.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * A manual order taken by staff from the dashboard order pad (walk-in / phone orders).
 *
 * <p>Unlike the customer {@link CreateOrderRequest} this carries no OTP {@code phoneToken}
 * and no {@code deviceToken} — the acting staff member is trusted, and is attributed via the
 * order event log. The restaurant is taken from the authenticated user; the branch is
 * validated against their access. Line items reuse {@link CreateOrderRequest.Item}.
 */
public record CreateStaffOrderRequest(
        @NotNull Long branchId,
        @NotNull OrderType orderType,
        /** Optional for DINE_IN — the table this order is for (must belong to the branch). */
        Long tableId,
        @Size(max = 150) String customerName,
        @Size(max = 40) String customerPhone,
        /** Required for CAR orders. */
        @Size(max = 40) String carPlate,
        @Size(max = 20) String carColor,
        @Size(max = 500) String customerNote,
        @NotEmpty @Valid List<CreateOrderRequest.Item> items,
        /**
         * Counter flow: the customer paid while ordering, so record it in the same transaction
         * as the order (two requests would let a dropped connection leave a paid-for order
         * showing unpaid). Method defaults to CARD like the manual mark-paid endpoint.
         */
        Boolean paid,
        PaymentMethod paymentMethod
) {}
