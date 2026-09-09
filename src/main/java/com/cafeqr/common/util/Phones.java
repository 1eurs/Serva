package com.cafeqr.common.util;

/** Canonicalizes customer phone numbers so matching (favorites, blocklist) is format-insensitive. */
public final class Phones {

    private Phones() {
    }

    /**
     * Keeps digits (converting Arabic-Indic numerals) and a leading {@code +};
     * drops spaces, dashes and everything else. Returns {@code null} when nothing usable remains.
     */
    public static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(raw.length());
        for (char c : raw.toCharArray()) {
            char digit = Pasted.westernDigit(c);
            if (digit >= '0' && digit <= '9') {
                sb.append(digit);
            } else if (c == '+' && sb.isEmpty()) {
                sb.append(c);
            }
        }
        return sb.isEmpty() ? null : sb.toString();
    }
}
