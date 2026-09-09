package com.cafeqr.common.util;

import com.cafeqr.common.domain.BilingualNamed;
import com.cafeqr.common.exception.BadRequestException;

import java.util.regex.Pattern;

/**
 * Applies an incoming name — one legacy string, or an English/Arabic pair — to a
 * {@link BilingualNamed} entity.
 *
 * <p>The legacy single {@code name} field is still accepted because clients predating the pair
 * send it, and because it is the only thing an owner types when they have one name for their café.
 * It is filed under the script it is written in: "Mutrah Coffee" is English, "قهوة مطرح" is Arabic.
 * Guessing from the script is right far more often than assuming a default language, and the admin
 * can move it either way afterwards.
 */
public final class Names {

    private static final Pattern ARABIC = Pattern.compile("\\p{IsArabic}");

    private Names() {
    }

    /** True when the text is written in Arabic script (a single Arabic letter is enough). */
    public static boolean isArabic(String value) {
        return value != null && ARABIC.matcher(value).find();
    }

    public static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * One side of a bilingual pair for a place that can only show one — half of a bilingual email,
     * a log line. Falls back to the other script, then to the legacy single value, rather than
     * rendering a blank where a name belongs: a name in the wrong script still names someone.
     */
    public static String preferring(String nameEn, String nameAr, String legacy, boolean arabic) {
        String preferred = trimToNull(arabic ? nameAr : nameEn);
        if (preferred != null) {
            return preferred;
        }
        String other = trimToNull(arabic ? nameEn : nameAr);
        return other != null ? other : legacy;
    }

    /**
     * Sets both names on a new entity. At least one of the three must carry something, otherwise
     * the café/branch would have no name to show in either language.
     */
    public static void applyOnCreate(BilingualNamed target, String legacyName, String nameEn, String nameAr) {
        String en = trimToNull(nameEn);
        String ar = trimToNull(nameAr);
        String legacy = trimToNull(legacyName);
        if (en == null && ar == null) {
            if (legacy == null) {
                throw new BadRequestException("A name is required (nameEn, nameAr, or name)");
            }
            if (isArabic(legacy)) {
                ar = legacy;
            } else {
                en = legacy;
            }
        }
        target.setNameEn(en);
        target.setNameAr(ar);
    }

    /**
     * PATCH semantics: {@code null} leaves a side alone, {@code ""} clears it. A legacy {@code name}
     * is only honoured when neither side of the pair was sent, and then it replaces the side matching
     * its script — so an owner renaming their café in Arabic never silently loses its English name.
     *
     * <p>Clearing both sides is refused: it would leave a nameless café whose header falls back to
     * a stale value nobody can edit.
     */
    public static void applyOnUpdate(BilingualNamed target, String legacyName, String nameEn, String nameAr) {
        if (nameEn == null && nameAr == null) {
            String legacy = trimToNull(legacyName);
            if (legacy == null) {
                return;
            }
            if (isArabic(legacy)) {
                target.setNameAr(legacy);
            } else {
                target.setNameEn(legacy);
            }
            return;
        }
        String en = nameEn != null ? trimToNull(nameEn) : target.getNameEn();
        String ar = nameAr != null ? trimToNull(nameAr) : target.getNameAr();
        if (en == null && ar == null) {
            throw new BadRequestException("A name is required in at least one language");
        }
        target.setNameEn(en);
        target.setNameAr(ar);
    }
}
