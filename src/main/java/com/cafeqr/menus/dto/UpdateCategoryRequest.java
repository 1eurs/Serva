package com.cafeqr.menus.dto;

import com.cafeqr.menus.domain.CourseType;
import jakarta.validation.constraints.Size;

public record UpdateCategoryRequest(
        @Size(max = 150) String nameEn,
        @Size(max = 150) String nameAr,
        @Size(max = 500) String descriptionEn,
        @Size(max = 500) String descriptionAr,
        Integer displayOrder,
        Boolean active,
        /** DRINK / FOOD / DESSERT; null leaves the existing tag unchanged. */
        CourseType courseType
) {}
