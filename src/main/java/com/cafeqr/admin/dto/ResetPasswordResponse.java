package com.cafeqr.admin.dto;

/**
 * The temporary password an admin just set on someone's account, returned once so it can be
 * read out over the phone. It is never stored in readable form and cannot be fetched again.
 */
public record ResetPasswordResponse(
        Long userId,
        String username,
        String temporaryPassword,
        boolean emailed
) {}
