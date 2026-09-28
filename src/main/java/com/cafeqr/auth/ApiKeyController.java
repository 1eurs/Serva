package com.cafeqr.auth;

import com.cafeqr.auth.dto.ApiKeyDtos.ApiKeyResponse;
import com.cafeqr.auth.dto.ApiKeyDtos.MintApiKeyRequest;
import com.cafeqr.auth.dto.ApiKeyDtos.MintedApiKeyResponse;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.common.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Owner self-service for API keys. Minting and revoking are owner-only (enforced in
 * {@link ApiKeyService}); the key's plaintext is returned once, by {@link #mint}, and never again.
 */
@RestController
@RequestMapping("/api/dashboard/api-keys")
@PreAuthorize("isAuthenticated()")
@Tag(name = "API keys")
@SecurityRequirement(name = "bearerAuth")
public class ApiKeyController {

    private final ApiKeyService apiKeyService;

    public ApiKeyController(ApiKeyService apiKeyService) {
        this.apiKeyService = apiKeyService;
    }

    @Operation(summary = "Mint a new API key (the key is shown once, in this response)")
    @PostMapping
    public ApiResponse<MintedApiKeyResponse> mint(@Valid @RequestBody MintApiKeyRequest request) {
        MintedApiKeyResponse key = apiKeyService.mint(
                SecurityUtils.currentUser(), request.label(), request.scopeOrDefault());
        return ApiResponse.ok("Key created — copy it now, it won't be shown again.", key);
    }

    @Operation(summary = "List this café's live API keys (never the keys themselves)")
    @GetMapping
    public ApiResponse<List<ApiKeyResponse>> list() {
        return ApiResponse.ok(apiKeyService.list(SecurityUtils.currentUser()));
    }

    @Operation(summary = "Revoke an API key")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> revoke(@PathVariable Long id) {
        apiKeyService.revoke(SecurityUtils.currentUser(), id);
        return ApiResponse.message("API key revoked");
    }
}
