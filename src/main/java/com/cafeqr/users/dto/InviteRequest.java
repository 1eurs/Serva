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
        @Size(max = 150) String fullName,
        /** Optional. When present the link is emailed as well as returned for sharing. */
        @Email @Size(max = 150) String email,
        @Size(max = 40) String phone,
        Set<Permission> permissions,
        /** Required when a PLATFORM_ADMIN invites into a café; otherwise inferred. */
        Long restaurantId,
        /** Optional branch scope. {@code null} → restaurant-wide. */
        Long branchId
) {}
