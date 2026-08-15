package com.cafeqr.auth.repository;

import com.cafeqr.auth.domain.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /** Invalidate any outstanding tokens for a user (called when a fresh one is issued or used). */
    @Modifying
    @Query("UPDATE PasswordResetToken t SET t.used = true WHERE t.userId = :userId AND t.used = false")
    void invalidateAllForUser(@Param("userId") Long userId);
}
