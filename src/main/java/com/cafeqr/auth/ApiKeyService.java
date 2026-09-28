package com.cafeqr.auth;

import com.cafeqr.auth.domain.ApiKey;
import com.cafeqr.auth.domain.ApiKeyScope;
import com.cafeqr.auth.dto.ApiKeyDtos.ApiKeyResponse;
import com.cafeqr.auth.dto.ApiKeyDtos.MintedApiKeyResponse;
import com.cafeqr.auth.repository.ApiKeyRepository;
import com.cafeqr.auth.security.CustomUserDetails;
import com.cafeqr.common.exception.ForbiddenException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

/**
 * Mints, lists, revokes and resolves API keys. The key is generated here, shown once, and stored
 * only as a SHA-256 hash — {@link #resolve} hashes what a request presents and looks that up, so
 * the plaintext never touches the database. Managing keys is an owner-only action.
 */
@Service
public class ApiKeyService {

    /** Distinguishes a key from a JWT at a glance, and lets the filter branch without a DB hit. */
    public static final String PREFIX = "serva_sk_";
    private static final int TOKEN_CHARS = 43; // ~256 bits of base62

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] BASE62 =
            "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".toCharArray();

    private final ApiKeyRepository repository;

    public ApiKeyService(ApiKeyRepository repository) {
        this.repository = repository;
    }

    /** True for anything shaped like our key, so the auth filter can skip JWT parsing. */
    public static boolean looksLikeApiKey(String token) {
        return token != null && token.startsWith(PREFIX);
    }

    @Transactional
    public MintedApiKeyResponse mint(CustomUserDetails owner, String label, ApiKeyScope scope) {
        requireOwner(owner);
        String plaintext = PREFIX + randomToken();
        ApiKey key = new ApiKey();
        key.setUserId(owner.getUserId());
        key.setRestaurantId(owner.getRestaurantId());
        key.setLabel(label.trim());
        key.setTokenHash(sha256Hex(plaintext));
        key.setLast4(plaintext.substring(plaintext.length() - 4));
        key.setScope(scope);
        key.setCreatedAt(Instant.now());
        ApiKey saved = repository.save(key);
        return new MintedApiKeyResponse(saved.getId(), saved.getLabel(), saved.getScope(), plaintext);
    }

    @Transactional(readOnly = true)
    public List<ApiKeyResponse> list(CustomUserDetails owner) {
        requireOwner(owner);
        return repository.findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(owner.getUserId())
                .stream().map(ApiKeyResponse::from).toList();
    }

    @Transactional
    public void revoke(CustomUserDetails owner, Long id) {
        requireOwner(owner);
        ApiKey key = repository.findById(id).orElseThrow(() -> ResourceNotFoundException.of("API key", id));
        // A key that isn't this owner's is, as far as they are concerned, not found.
        if (!key.getUserId().equals(owner.getUserId())) {
            throw ResourceNotFoundException.of("API key", id);
        }
        if (key.getRevokedAt() == null) {
            key.setRevokedAt(Instant.now());
            repository.save(key);
        }
    }

    /**
     * Resolve a presented key to its row, or empty if unknown, revoked or expired. Touches
     * {@code lastUsedAt} at most once a minute so a busy key isn't a write on every request.
     */
    @Transactional
    public Optional<ApiKey> resolve(String presentedKey) {
        if (!looksLikeApiKey(presentedKey)) {
            return Optional.empty();
        }
        Optional<ApiKey> found = repository.findByTokenHash(sha256Hex(presentedKey));
        if (found.isEmpty() || !found.get().isActive()) {
            return Optional.empty();
        }
        ApiKey key = found.get();
        touchLastUsed(key);
        return Optional.of(key);
    }

    private void touchLastUsed(ApiKey key) {
        Instant now = Instant.now();
        if (key.getLastUsedAt() == null || key.getLastUsedAt().isBefore(now.minus(1, ChronoUnit.MINUTES))) {
            key.setLastUsedAt(now);
            repository.save(key);
        }
    }

    private void requireOwner(CustomUserDetails user) {
        if (!user.isOwner()) {
            throw new ForbiddenException("Only the café owner can manage API keys.");
        }
    }

    private static String randomToken() {
        StringBuilder sb = new StringBuilder(TOKEN_CHARS);
        for (int i = 0; i < TOKEN_CHARS; i++) {
            sb.append(BASE62[RANDOM.nextInt(BASE62.length)]);
        }
        return sb.toString();
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required but unavailable", e);
        }
    }
}
