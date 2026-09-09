package com.cafeqr.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The encoder is where setting a password and checking one are made to agree. Both sides clean
 * the same characters, so it cannot matter which of the two was the one that got pasted.
 */
class PastedPasswordEncoderTest {

    private final PasswordEncoder encoder = new SecurityConfig(null, null, null, null, null).passwordEncoder();

    @Test
    void aPasswordSetCleanIsAcceptedWhenItIsPastedBackWithInvisibleMarks() {
        String hash = encoder.encode("Owner123!");

        assertThat(encoder.matches("‏Owner123!‏", hash)).isTrue();
        assertThat(encoder.matches("⁨Owner123!⁩", hash)).isTrue();
        assertThat(encoder.matches("Owner123!﻿", hash)).isTrue();
    }

    @Test
    void aPasswordSetFromAPasteIsAcceptedWhenItIsLaterTypedByHand() {
        String hash = encoder.encode("‏Owner123!");

        assertThat(encoder.matches("Owner123!", hash)).isTrue();
    }

    /** Cleaning invisible characters is not a licence to ignore visible ones. */
    @Test
    void aWrongPasswordIsStillWrong() {
        String hash = encoder.encode("Owner123!");

        assertThat(encoder.matches("Owner123", hash)).isFalse();
        assertThat(encoder.matches("Owner123! ", hash)).isFalse();
        assertThat(encoder.matches("owner123!", hash)).isFalse();
    }
}
