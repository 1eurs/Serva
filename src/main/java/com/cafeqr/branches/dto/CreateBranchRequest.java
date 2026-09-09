package com.cafeqr.branches.dto;

import jakarta.validation.constraints.Size;

public record CreateBranchRequest(
        /** Legacy single name; at least one of name / nameEn / nameAr is required. */
        @Size(max = 150) String name,
        @Size(max = 150) String nameEn,
        @Size(max = 150) String nameAr,
        @Size(max = 300) String address,
        @Size(max = 40) String phone,
        @Size(max = 500) String openingHours
) {}
