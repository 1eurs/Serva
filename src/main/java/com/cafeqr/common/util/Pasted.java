package com.cafeqr.common.util;

/**
 * Undoes what a copy-paste does to a credential.
 *
 * <p>Logins here travel by message: the admin creates a café and sends the owner a username and
 * password, an owner sends a staff member theirs. A copy taken out of a right-to-left message
 * arrives with invisible passengers — a bidi mark (U+200F, U+200E), an isolate wrapped around the
 * latin run, a zero-width space, a non-breaking space off a web page. Not one of them shows on
 * screen, and not one of them is removed by {@code trim()} or {@code strip()}: the field looks
 * exactly right and the login is rejected, which the person reads as "wrong password".
 *
 * <p>An Arabic keyboard adds the visible half of the same problem. Its number row types ٠١٢٣, so
 * the username "mutrah2" is entered as "mutrah٢" and matches nothing.
 *
 * <p>Cleaning happens on the way in <em>and</em> on the way out — on what is stored and on what is
 * looked up — because a fix on one side alone just moves which of the two is wrong.
 */
public final class Pasted {

    private Pasted() {
    }

    /**
     * A username or an email — anything matched by equality. Invisible characters go, an
     * Arabic-Indic digit becomes its western twin, an exotic space becomes a plain one so the
     * edges can be trimmed.
     */
    public static String identifier(String raw) {
        if (raw == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            int type = Character.getType(c);
            if (type == Character.FORMAT) {
                continue; // Cf: bidi marks and isolates, zero-width space, BOM, soft hyphen
            }
            // Neither trim() nor strip() drops a non-breaking space; as a plain space it goes.
            sb.append(type == Character.SPACE_SEPARATOR ? ' ' : westernDigit(c));
        }
        return sb.toString().trim();
    }

    /**
     * A password. The invisible characters go and nothing else does: a space may have been chosen
     * on purpose, and an Arabic digit in a password is a character like any other — only a mark
     * nobody can see can be ruled out as unintended.
     */
    public static String secret(String raw) {
        if (raw == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (Character.getType(c) != Character.FORMAT) {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    /** Arabic-Indic (٠-٩) and extended Arabic-Indic (۰-۹) digits as 0-9; anything else unchanged. */
    static char westernDigit(char c) {
        if (c >= '٠' && c <= '٩') {
            return (char) ('0' + c - '٠');
        }
        if (c >= '۰' && c <= '۹') {
            return (char) ('0' + c - '۰');
        }
        return c;
    }
}
