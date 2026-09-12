package com.cafeqr.branches.dto;

import com.cafeqr.branches.domain.Branch;

import java.math.BigDecimal;
import java.time.Instant;

public record BranchResponse(
        Long id,
        Long restaurantId,
        /** Legacy single name, kept for callers that predate the bilingual pair. */
        String name,
        String nameEn,
        String nameAr,
        String address,
        String phone,
        String openingHours,
        boolean active,
        /**
         * Whether the branch is taking customer orders right now — the effective answer, with
         * an expired pause already counted as resumed. Readers get one truth rather than a flag
         * plus a clock they each have to apply.
         */
        boolean acceptingOrders,
        /** When the current pause lifts by itself; null when not paused or paused indefinitely. */
        Instant pauseUntil,
        boolean printerEnabled,
        boolean counterMode,
        boolean tillEnabled,
        boolean tillBlindCount,
        boolean tillCarryFloat,
        BigDecimal tillNoteOver,
        Instant createdAt,
        Instant updatedAt
) {
    public static BranchResponse from(Branch b) {
        boolean accepting = b.isAcceptingOrdersNow();
        return new BranchResponse(
                b.getId(), b.getRestaurantId(), b.getName(), b.getNameEn(), b.getNameAr(), b.getAddress(), b.getPhone(),
                b.getOpeningHours(), b.isActive(), accepting, accepting ? null : b.getPauseUntil(),
                b.isPrinterEnabled(), b.isCounterMode(),
                b.isTillEnabled(), b.isTillBlindCount(), b.isTillCarryFloat(), b.getTillNoteOver(),
                b.getCreatedAt(), b.getUpdatedAt());
    }
}
