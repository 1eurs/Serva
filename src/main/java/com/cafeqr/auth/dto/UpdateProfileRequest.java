package com.cafeqr.auth.dto;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        /** Legacy single name; prefer the pair below. At least one name must survive the update. */
        @Size(max = 150) String fullName,
        @Size(max = 150) String fullNameEn,
        @Size(max = 150) String fullNameAr,
        @Size(max = 40) String phone
) {}
