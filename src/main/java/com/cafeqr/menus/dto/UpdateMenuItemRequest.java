package com.cafeqr.menus.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record UpdateMenuItemRequest(
        Long categoryId,
        @Size(max = 150) String nameEn,
        @Size(max = 150) String nameAr,
        @Size(max = 500) String descriptionEn,
        @Size(max = 500) String descriptionAr,
        @DecimalMin(value = "0.0", inclusive = false) @Digits(integer = 9, fraction = 3) BigDecimal price,
        /** Optional discount. Always applied on update: "PERCENT"/"FIXED" set it, null/"NONE" clears it. */
        String discountType,
        @Digits(integer = 9, fraction = 3) BigDecimal discountValue,
        Instant discountStartsAt,
        Instant discountEndsAt,
        @Size(max = 500) String imageUrl,
        Boolean removeImage,
        /** Photo gallery. When present, replaces the whole gallery; first entry becomes imageUrl.
         *  Send an empty list to clear all photos. Null = leave the gallery untouched. */
        List<@Size(max = 500) String> imageUrls,
        Boolean available,
        @Positive Integer preparationTimeMinutes,
        Integer displayOrder,
        /** Option groups. When present, replaces all groups (pass an empty list to clear). */
        List<CreateMenuItemRequest.OptionGroupInput> optionGroups,
        /** Combo contents. When present, replaces them (empty list = no longer a combo). Null = untouched. */
        List<Long> comboItemIds
        ) {}
