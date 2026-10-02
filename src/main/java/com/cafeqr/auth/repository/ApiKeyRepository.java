package com.cafeqr.auth.repository;

import com.cafeqr.auth.domain.ApiKey;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ApiKeyRepository extends JpaRepository<ApiKey, Long> {

    /** Lookup on every authenticated request — indexed by the unique constraint on token_hash. */
    Optional<ApiKey> findByTokenHash(String tokenHash);

    /** The owner's live keys, newest first. Revoked keys stay in the table but drop off the list. */
    List<ApiKey> findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(Long userId);
}
