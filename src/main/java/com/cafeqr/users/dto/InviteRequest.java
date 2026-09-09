package com.cafeqr.users.dto;

import com.cafeqr.users.domain.Permission;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Set;

/**
 * Invites a staff member. Deliberately the same shape as {@link CreateUserRequest} minus the
 * password — the whole point is that the inviter never chooses one.
 */
public record InviteRequest(
        @NotBlank @Size(max = 60) String username,
        /** Optional display name — defaults to the username when blank. */
        /** Legacy single name; prefer the pair below. Sent alone, it is filed by its script. */
        @Size(max = 150) String fullName,
        @Size(max = 150) String fullNameEn,
        @Size(max = 150) String fullNameAr,
        /**
         * Optional, and only ever the account's own address — for a password reset later. The
         * join link is not sent anywhere: it comes back in the response for the owner to pass on
         * themselves, which is the whole design (café staff often have no work email, and the
         * owner already has them on WhatsApp).
         */
        @Email @Size(max = 150) String email,
        @Size(max = 40) String phone,
        Set<Permission> permissions,
        /** Required when a PLATFORM_ADMIN invites into a café; otherwise inferred. */
        Long restaurantId,
        /** Optional branch scope. {@code null} → restaurant-wide. */
        Long branchId
) {}
