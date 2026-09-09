package com.cafeqr.users.dto;

import com.cafeqr.users.domain.Permission;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Set;

/**
 * Creates a staff account. The creator picks a {@code username} + {@code password} and toggles
 * exactly which {@link Permission permissions} the member gets — there are no fixed roles.
 */
public record CreateUserRequest(
        @NotBlank @Size(max = 60) String username,
        @NotBlank @Size(min = 8, max = 100) String password,
        /** Optional display name — defaults to the username when blank. */
        /** Legacy single name; prefer the pair below. Sent alone, it is filed by its script. */
        @Size(max = 150) String fullName,
        @Size(max = 150) String fullNameEn,
        @Size(max = 150) String fullNameAr,
        /** Optional — only needed for email-based password reset. */
        @Email @Size(max = 150) String email,
        @Size(max = 40) String phone,
        /** Areas the member may access. */
        Set<Permission> permissions,
        /** Required when a PLATFORM_ADMIN creates a restaurant user; otherwise inferred. */
        Long restaurantId,
        /** Optional branch scope. {@code null} → restaurant-wide (all branches). */
        Long branchId
) {}
