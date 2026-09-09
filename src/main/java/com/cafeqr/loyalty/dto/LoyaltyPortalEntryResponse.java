package com.cafeqr.loyalty.dto;

import java.time.Instant;
import java.util.List;

/** One café's stamp card in the customer's cross-café portal. */
public record LoyaltyPortalEntryResponse(
        String restaurantSlug,
        /** Legacy single name; the client prefers the bilingual pair below. */
        String restaurantName,
        String restaurantNameEn,
        String restaurantNameAr,
        String logoUrl,
        int stampsRequired,
        String rewardLabel,
        /** Names of the menu items claimable as the free reward (customer picks one). */
        List<RewardItemName> rewardItems,
        int stamps,
        int availableRewards,
        Instant updatedAt,
        /** Card style (loyalty card studio): accent/background hex, stamp emoji, watermark motif key. */
        String cardColor,
        String cardBg,
        String stampIcon,
        String cardMotif
) {
    /** Bilingual name of one eligible reward item; the client picks by UI language. */
    public record RewardItemName(String nameEn, String nameAr) {}
}
