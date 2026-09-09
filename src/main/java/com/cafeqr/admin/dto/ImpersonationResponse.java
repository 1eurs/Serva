package com.cafeqr.admin.dto;

import com.cafeqr.auth.dto.UserResponse;

/**
 * A short-lived session inside a café, for support.
 *
 * <p>Deliberately not an {@code AuthResponse}: there is no refresh token, so the session cannot
 * renew itself and simply lapses. An admin who closed the tab is not still logged in as the café
 * an hour later.
 */
public record ImpersonationResponse(
        String accessToken,
        String tokenType,
        long expiresInSeconds,
        UserResponse user,
        Long restaurantId,
        String restaurantName
) {}
