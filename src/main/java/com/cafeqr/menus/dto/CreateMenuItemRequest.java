package com.cafeqr.menus.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record CreateMenuItemRequest(
        /** Required only for PLATFORM_ADMIN; otherwise taken from the authenticated user. */
        Long restaurantId,
        Long branchId,
        @NotNull Long categoryId,
        @NotBlank @Size(max = 150) String nameEn,
        @NotBlank @Size(max = 150) String nameAr,
        @Size(max = 500) String descriptionEn,
        @Size(max = 500) String descriptionAr,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @Digits(integer = 9, fraction = 3) BigDecimal price,
        /** Optional discount. "PERCENT" | "FIXED" | null/"NONE". Cross-field rules checked in MenuService. */
        String discountType,
        @Digits(integer = 9, fraction = 3) BigDecimal discountValue,
        Instant discountStartsAt,
        Instant discountEndsAt,
        @Size(max = 500) String imageUrl,
        /** Photo gallery (slider). If present, the first entry is also written to imageUrl. */
        List<@Size(max = 500) String> imageUrls,
        Boolean available,
        @Positive Integer preparationTimeMinutes,
        Integer displayOrder,
        /** Option groups (size, milk type, extras). Replaces any existing groups on update. */
        List<OptionGroupInput> optionGroups,
        /** Items this combo bundles (repeat an id for "2 x"). Null or empty = a plain item. */
        List<Long> comboItemIds
        ) {

    public record OptionGroupInput(
            @NotBlank @Size(max = 150) String nameEn,
            @NotBlank @Size(max = 150) String nameAr,
            @NotNull String selectionType,   // SINGLE | MULTI
            Boolean required,
            Integer displayOrder,
            List<OptionInput> options
    ) {}

    public record OptionInput(
            @NotBlank @Size(max = 150) String nameEn,
            @NotBlank @Size(max = 150) String nameAr,
            @Digits(integer = 9, fraction = 3) BigDecimal priceDelta,
            Integer displayOrder
    ) {}
}
