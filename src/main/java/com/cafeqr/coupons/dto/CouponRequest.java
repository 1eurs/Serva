package com.cafeqr.coupons.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** What the owner fills in on the coupon screen. */
public record CouponRequest(
        /** Free text; cleaned and upper-cased server-side, and checked unique within the café. */
        @NotBlank @Size(max = 24) String code,
        @NotBlank @Size(max = 80) String label,
        @NotNull Boolean active,
        /** At least one item: a coupon that covers nothing takes nothing off and only confuses a counter. */
        @NotEmpty @Valid List<Item> items
) {
    /** One covered item and its percent off — 100 hands it over free. */
    public record Item(
            @NotNull Long menuItemId,
            @Min(1) @Max(100) int percentOff
    ) {}
}
