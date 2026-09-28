package com.cafeqr.auth.dto;

import com.cafeqr.auth.domain.ApiKey;
import com.cafeqr.auth.domain.ApiKeyScope;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/** Everything the API-key endpoints are asked and everything they answer. */
public final class ApiKeyDtos {

    private ApiKeyDtos() {
    }

    public record MintApiKeyRequest(
            @NotBlank @Size(max = 120) String label,
            /** READ_ONLY (default) or FULL. */
            ApiKeyScope scope
    ) {
        public ApiKeyScope scopeOrDefault() {
            return scope == null ? ApiKeyScope.READ_ONLY : scope;
        }
    }

    /**
     * Returned once, at mint: the only time the plaintext {@code key} is ever shown. Every later
     * read of the key list carries {@link ApiKeyResponse} instead, which has only the last4.
     */
    public record MintedApiKeyResponse(
            Long id,
            String label,
            ApiKeyScope scope,
            String key
    ) {}

    /** One key as a list reads it — never the key itself, only enough to recognise it. */
    public record ApiKeyResponse(
            Long id,
            String label,
            ApiKeyScope scope,
            String last4,
            Instant createdAt,
            Instant lastUsedAt
    ) {
        public static ApiKeyResponse from(ApiKey k) {
            return new ApiKeyResponse(k.getId(), k.getLabel(), k.getScope(), k.getLast4(),
                    k.getCreatedAt(), k.getLastUsedAt());
        }
    }
}
