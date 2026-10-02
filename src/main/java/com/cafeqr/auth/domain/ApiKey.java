package com.cafeqr.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A machine credential that acts as one owner account, so an AI/agent can reach the API without the
 * owner's password living in a config file. Only the SHA-256 hash of the key is stored — the key
 * itself is shown once, at mint, and never again. A {@link ApiKeyScope#READ_ONLY} key is refused
 * server-side for any write, which is what makes it safe to hand to an agent.
 */
@Entity
@Table(name = "api_keys")
public class ApiKey {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The account this key authenticates as. */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Denormalised from the user, so a café's keys list without a join. */
    @Column(name = "restaurant_id")
    private Long restaurantId;

    @Column(name = "label", nullable = false)
    private String label;

    /** SHA-256 hex of the presented key. The plaintext is never stored. */
    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    /** Last 4 chars of the key, for telling two keys apart in a list. */
    @Column(name = "last4", nullable = false)
    private String last4;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false)
    private ApiKeyScope scope;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    /** Reserved: no TTL today, so it stays null; adding expiry later needs no migration. */
    @Column(name = "expires_at")
    private Instant expiresAt;

    /** Retiring a key switches it off rather than deleting it, so nothing it did is rewritten. */
    @Column(name = "revoked_at")
    private Instant revokedAt;

    /** Usable right now: not revoked, and not past any expiry. */
    public boolean isActive() {
        return revokedAt == null && (expiresAt == null || expiresAt.isAfter(Instant.now()));
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getRestaurantId() {
        return restaurantId;
    }

    public void setRestaurantId(Long restaurantId) {
        this.restaurantId = restaurantId;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public void setTokenHash(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public String getLast4() {
        return last4;
    }

    public void setLast4(String last4) {
        this.last4 = last4;
    }

    public ApiKeyScope getScope() {
        return scope;
    }

    public void setScope(ApiKeyScope scope) {
        this.scope = scope;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public void setLastUsedAt(Instant lastUsedAt) {
        this.lastUsedAt = lastUsedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public void setRevokedAt(Instant revokedAt) {
        this.revokedAt = revokedAt;
    }
}
