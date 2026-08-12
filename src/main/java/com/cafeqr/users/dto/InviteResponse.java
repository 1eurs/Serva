package com.cafeqr.users.dto;

import java.time.Instant;
import java.util.List;

/**
 * A pending invitation as the owner sees it. {@code joinUrl} is the thing they actually share —
 * it carries the single-use token, so it is only ever returned to staff who may manage the team.
 */
public record InviteResponse(
        Long id,
        Long userId,
        String username,
        String fullName,
        List<String> permissions,
        Long branchId,
        String joinUrl,
        Instant expiresAt,
        Instant createdAt
) {}
