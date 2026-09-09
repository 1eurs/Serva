package com.cafeqr.users.dto;

import com.cafeqr.users.domain.Permission;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

import java.util.Set;

/**
 * Edits a staff account. All fields optional — only non-null fields are applied.
 * Pass {@code password} to reset it (the owner generates a new one and copies it out).
 *
 * <p>Branch is deliberately not here: "all branches" is a null, and a null field in this record
 * already means "leave unchanged". It has its own action, {@link SetBranchRequest}.
 */
public record UpdateUserRequest(
        /** Legacy single name; prefer the pair below. Sent alone, it is filed by its script. */
        @Size(max = 150) String fullName,
        @Size(max = 150) String fullNameEn,
        @Size(max = 150) String fullNameAr,
        /** Send "" to clear it. Changing it moves where this account's password resets go, so
         *  it obeys the same rule as setting a password. */
        @Email @Size(max = 150) String email,
        @Size(max = 40) String phone,
        @Size(min = 8, max = 100) String password,
        Set<Permission> permissions
) {}
