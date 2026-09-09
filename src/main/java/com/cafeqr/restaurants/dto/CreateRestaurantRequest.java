package com.cafeqr.restaurants.dto;

import com.cafeqr.restaurants.domain.Plan;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * Admin-only restaurant creation. The restaurant is created active and on the chosen plan.
 * Optional nested blocks let the admin complete onboarding in one call instead of three:
 * <ul>
 *   <li>{@code owner} — creates the restaurant's primary/owner user (active, role
 *       {@code RESTAURANT_OWNER}). Omit it if the owner will be added later.</li>
 *   <li>{@code defaultBranchName} — creates a first branch. Defaults to the restaurant name.</li>
 *   <li>{@code plan} — the tier the café starts on. Defaults to STANDARD. It is also the tier
 *       of the subscription created alongside the café, and after this call the two only ever
 *       move together: a later change goes through the subscription
 *       ({@code PATCH /api/admin/subscriptions/{id}}), never the café.</li>
 * </ul>
 */
public record CreateRestaurantRequest(
        /**
         * Legacy single name. Older clients send only this; it is filed under the script it is
         * written in. Prefer {@code nameEn}/{@code nameAr} — at least one of the three is required.
         */
        @Size(max = 150) String name,
        @Size(max = 150) String nameEn,
        @Size(max = 150) String nameAr,
        @Size(max = 150) String slug,
        @Size(max = 500) String logoUrl,
        @Size(max = 40) String phone,
        @Email @Size(max = 150) String email,
        @Size(max = 300) String instagramUrl,
        @Size(min = 3, max = 3) String currency,
        Boolean vatEnabled,
        @DecimalMin("0.0") @DecimalMax("100.0") BigDecimal vatRate,

        /** Tier the café starts on, and the tier of its first subscription. {@code null} →
         *  STANDARD, matching the column default. */
        Plan plan,

        /** Name of the first branch to provision; {@code null} → uses the restaurant name. */
        @Size(max = 150) String defaultBranchName,

        /** Optional owner account created in the same call. */
        @Valid Owner owner
) {
    public record Owner(
            /** Legacy single name; prefer the pair below. One of the three is required. */
            @Size(max = 150) String fullName,
            @Size(max = 150) String fullNameEn,
            @Size(max = 150) String fullNameAr,
            @NotBlank @Email @Size(max = 150) String email,
            @Size(max = 40) String phone,
            @NotBlank @Size(min = 8, max = 100) String password
    ) {}
}