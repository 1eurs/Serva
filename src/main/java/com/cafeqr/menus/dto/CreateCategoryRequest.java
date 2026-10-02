package com.cafeqr.menus.dto;

import com.cafeqr.menus.domain.CourseType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateCategoryRequest(
        /** Required only for PLATFORM_ADMIN; otherwise taken from the authenticated user. */
        Long restaurantId,
        /** Null = restaurant-wide; otherwise the branch this category belongs to. */
        Long branchId,
        @NotBlank @Size(max = 150) String nameEn,
        @NotBlank @Size(max = 150) String nameAr,
        @Size(max = 500) String descriptionEn,
        @Size(max = 500) String descriptionAr,
        Integer displayOrder,
        Boolean active,
        /** DRINK / FOOD / DESSERT — powers smarter cart suggestions; optional. */
        CourseType courseType
) {}
