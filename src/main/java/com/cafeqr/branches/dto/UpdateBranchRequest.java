package com.cafeqr.branches.dto;

import jakarta.validation.constraints.Size;

public record UpdateBranchRequest(
        /** Legacy single name; prefer the bilingual pair below. Send "" to clear one side. */
        @Size(max = 150) String name,
        @Size(max = 150) String nameEn,
        @Size(max = 150) String nameAr,
        @Size(max = 300) String address,
        @Size(max = 40) String phone,
        @Size(max = 500) String openingHours,
        Boolean printerEnabled,
        Boolean counterMode
) {}
