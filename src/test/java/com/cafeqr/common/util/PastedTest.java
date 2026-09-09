package com.cafeqr.common.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PastedTest {

    /** The one a copy out of a WhatsApp message in Arabic actually produces. */
    @Test
    void identifierDropsTheBidiMarksAPasteWrapsALoginIn() {
        assertThat(Pasted.identifier("‏mutrah‏")).isEqualTo("mutrah");
        assertThat(Pasted.identifier("‎mutrah")).isEqualTo("mutrah");
        assertThat(Pasted.identifier("؜mutrah")).isEqualTo("mutrah");
        assertThat(Pasted.identifier("‫mutrah‬")).isEqualTo("mutrah");
        assertThat(Pasted.identifier("⁨mutrah⁩")).isEqualTo("mutrah");
        assertThat(Pasted.identifier("mutrah​")).isEqualTo("mutrah");
        assertThat(Pasted.identifier("﻿mutrah­")).isEqualTo("mutrah");
    }

    /** Neither trim() nor strip() removes a non-breaking space; off a web page, one always is. */
    @Test
    void identifierTrimsSpacesJavaItselfWouldNotTrim() {
        assertThat(" info@mutrah.om ".trim()).isNotEqualTo("info@mutrah.om");
        assertThat(Pasted.identifier(" info@mutrah.om ")).isEqualTo("info@mutrah.om");
        assertThat(Pasted.identifier("  info@mutrah.om \n")).isEqualTo("info@mutrah.om");
    }

    /** An Arabic keyboard's number row types ٠١٢٣, so a username with a digit in it arrives wrong. */
    @Test
    void identifierWritesArabicIndicDigitsTheWayTheyWereStored() {
        assertThat(Pasted.identifier("mutrah٢")).isEqualTo("mutrah2");
        assertThat(Pasted.identifier("barista۷")).isEqualTo("barista7");
    }

    @Test
    void identifierLeavesACleanLoginExactlyAsItIs() {
        assertThat(Pasted.identifier("Info@Mutrah.om")).isEqualTo("Info@Mutrah.om");
        assertThat(Pasted.identifier("قهوة")).isEqualTo("قهوة");
        assertThat(Pasted.identifier(null)).isNull();
        assertThat(Pasted.identifier("")).isEmpty();
    }

    /** A password is only stripped of what nobody could have meant to type. */
    @Test
    void secretKeepsEveryVisibleCharacterIncludingSpacesAndArabicDigits() {
        assertThat(Pasted.secret("‏correct horse‏")).isEqualTo("correct horse");
        assertThat(Pasted.secret(" pass 123 ")).isEqualTo(" pass 123 ");
        assertThat(Pasted.secret("kalimat٢٣")).isEqualTo("kalimat٢٣");
        assertThat(Pasted.secret(null)).isNull();
    }
}
