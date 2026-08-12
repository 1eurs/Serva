package com.cafeqr.users.dto;

import java.time.Instant;
import java.util.List;

/**
 * What the invitee is shown before setting a password: which café, which login name, and what
 * they will be able to do. Public endpoint, so it carries nothing about anyone else — no contact
 * details, no other staff, no café internals.
 */
public record InvitePreviewResponse(
        String username,
        String fullName,
        String cafeName,
        List<String> permissions,
        Instant expiresAt
) {}
