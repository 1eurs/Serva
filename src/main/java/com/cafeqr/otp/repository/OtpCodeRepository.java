package com.cafeqr.otp.repository;

import com.cafeqr.otp.domain.OtpCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface OtpCodeRepository extends JpaRepository<OtpCode, Long> {

    Optional<OtpCode> findByPhone(String phone);

    @Modifying
    @Query("DELETE FROM OtpCode o WHERE o.phone = :phone")
    void deleteByPhone(@Param("phone") String phone);

    /** The sweep. Returns the row count so the caller can log something meaningful. */
    @Modifying
    @Query("DELETE FROM OtpCode o WHERE o.expiresAt < :cutoff")
    int deleteExpired(@Param("cutoff") Instant cutoff);
}
