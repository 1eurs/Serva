package com.cafeqr.common.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** Generates unguessable, URL-safe opaque tokens (QR tokens, tracking tokens, refresh tokens). */
public final class Tokens {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private Tokens() {
    }

    /**
     * The value to store for a token that is handed to someone as a bearer credential.
     *
     * <p>Plain SHA-256 rather than BCrypt on purpose. A password hash is deliberately slow
     * because passwords are low-entropy and guessable; these tokens are 48 random bytes from
     * {@link SecureRandom}, so there is nothing to guess and the only job is to make the
     * stored value useless to whoever reads the table — a database dump, or one of the
     * backups that now leave the server. A slow hash on the lookup path would buy nothing and
     * cost every refresh.
     */
    public static String sha256(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by every JVM", e);
        }
    }

    /** Default 32-byte token (~43 url-safe chars). */
    public static String random() {
        return random(32);
    }

    public static String random(int numBytes) {
        byte[] bytes = new byte[numBytes];
        RANDOM.nextBytes(bytes);
        return ENCODER.encodeToString(bytes);
    }
}
