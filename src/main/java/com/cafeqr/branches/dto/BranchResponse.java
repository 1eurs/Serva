package com.cafeqr.branches.dto;

import com.cafeqr.branches.domain.Branch;

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
        boolean acceptingOrders,
        boolean printerEnabled,
        boolean counterMode,
        Instant createdAt,
        Instant updatedAt
) {
    public static BranchResponse from(Branch b) {
        return new BranchResponse(
                b.getId(), b.getRestaurantId(), b.getName(), b.getNameEn(), b.getNameAr(), b.getAddress(), b.getPhone(),
                b.getOpeningHours(), b.isActive(), b.isAcceptingOrders(), b.isPrinterEnabled(), b.isCounterMode(),
                b.getCreatedAt(), b.getUpdatedAt());
    }
}
