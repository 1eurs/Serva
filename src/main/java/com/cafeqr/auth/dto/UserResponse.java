package com.cafeqr.auth.dto;

import com.cafeqr.users.domain.Permission;
import com.cafeqr.users.domain.User;

import java.time.Instant;
import java.util.Set;

public record UserResponse(
        Long id,
        String fullName,
        String username,
        String email,
        String phone,
        Set<Permission> permissions,
        boolean owner,
        Long restaurantId,
        Long branchId,
        boolean active,
        /**
         * Invited but not yet claimed. Distinct from a deactivated account even though both read
         * {@code active = false} — the team list must not show "disabled" next to someone who
         * simply hasn't opened their link yet.
         */
        boolean pendingInvite,
        Instant createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getFullName(),
                user.getUsername(),
                user.getEmail(),
                user.getPhone(),
                Set.copyOf(user.getPermissions()),
                user.isOwner(),
                user.getRestaurantId(),
                user.getBranchId(),
                user.isActive(),
                user.isPendingInvite(),
                user.getCreatedAt());
    }
}
