package com.cafeqr.common.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TokensTest {

    /**
     * Pins {@link Tokens#sha256} to standard, lowercase-hex SHA-256.
     *
     * <p>This is load-bearing rather than decorative. V42 backfilled every existing
     * refresh-token row using Postgres' own {@code encode(sha256(...), 'hex')}, so if Java
     * ever computed the digest differently — a different encoding, uppercase hex, a stray
     * newline — no already-issued refresh token would resolve and every signed-in user would
     * be logged out at once, with nothing in the logs to say why.
     */
    @Test
    void sha256MatchesTheStandardVector() {
        assertThat(Tokens.sha256("test"))
                .isEqualTo("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
        assertThat(Tokens.sha256(""))
                .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    @Test
    void sha256IsStableAndFixedLength() {
        String token = Tokens.random(48);
        assertThat(Tokens.sha256(token)).hasSize(64).isEqualTo(Tokens.sha256(token));
        assertThat(Tokens.sha256(token)).isNotEqualTo(Tokens.sha256(Tokens.random(48)));
    }

    /** The stored value must not be the credential itself — the whole point of V42. */
    @Test
    void sha256DoesNotEchoTheToken() {
        String token = Tokens.random(48);
        assertThat(Tokens.sha256(token)).doesNotContain(token);
    }
}
