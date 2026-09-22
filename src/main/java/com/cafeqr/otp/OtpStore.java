package com.cafeqr.otp;

import com.cafeqr.otp.domain.OtpCode;
import com.cafeqr.otp.repository.OtpCodeRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * OTP codes keyed by normalized phone number.
 * TTL is 5 minutes; max 5 failed attempts before the entry is invalidated.
 *
 * <p>Backed by the database rather than a map on the heap. As a map this could not survive a
 * restart — a customer who requested a code moments before a deploy would enter a correct
 * code and be told it was invalid — and a code issued by one backend instance could never be
 * verified by another, which ruled out running a second one.
 */
@Component
public class OtpStore {

    static final int TTL_SECONDS = 300;
    private static final int MAX_ATTEMPTS = 5;

    private final OtpCodeRepository repository;

    public OtpStore(OtpCodeRepository repository) {
        this.repository = repository;
    }

    /**
     * Stores a code for a phone, replacing any code already outstanding.
     *
     * <p>Replacing rather than adding is what makes "request a new code" invalidate the old
     * one, so several codes are never live for one phone at the same time.
     */
    @Transactional
    void put(String phone, String code) {
        OtpCode entry = repository.findByPhone(phone).orElseGet(() -> {
            OtpCode fresh = new OtpCode();
            fresh.setPhone(phone);
            fresh.setCreatedAt(Instant.now());
            return fresh;
        });
        entry.setCode(code);
        entry.setAttempts(0);
        entry.setExpiresAt(Instant.now().plusSeconds(TTL_SECONDS));
        repository.save(entry);
    }

    @Transactional(readOnly = true)
    String peek(String phone) {
        return repository.findByPhone(phone)
                .filter(entry -> !entry.isExpired())
                .map(OtpCode::getCode)
                .orElse(null);
    }

    @Transactional
    boolean verify(String phone, String code) {
        OtpCode entry = repository.findByPhone(phone).orElse(null);
        if (entry == null) {
            return false;
        }
        if (entry.isExpired() || entry.getAttempts() >= MAX_ATTEMPTS) {
            repository.deleteByPhone(phone);
            return false;
        }
        if (!entry.getCode().equals(code)) {
            // Count the miss rather than deleting, so the attempt ceiling is what stops a
            // guessing run — deleting on the first wrong digit would let anyone knock a real
            // customer's code out by typing one wrong.
            entry.setAttempts(entry.getAttempts() + 1);
            repository.save(entry);
            return false;
        }
        repository.deleteByPhone(phone);
        return true;
    }

    /** Codes are consumed on success, so this only clears the ones nobody came back for. */
    @Scheduled(fixedDelay = 60_000)
    @Transactional
    void evictExpired() {
        repository.deleteExpired(Instant.now());
    }
}
