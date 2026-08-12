package com.cafeqr.stock.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/**
 * Create or update one thing the café holds.
 *
 * <p>Quantities elsewhere are base units, but this is where the café describes how it actually
 * buys the thing: {@code purchaseUnitLabel} "1 kg bag" with {@code purchaseUnitSize} 1000 means
 * every later "3 bags arrived" converts itself.
 */
public record StockItemRequest(
        @NotBlank @Size(max = 150) String nameEn,
        @NotBlank @Size(max = 150) String nameAr,
        /** INGREDIENT | GOOD | PREP. */
        @NotBlank String kind,
        /** G | ML | PIECE. */
        @NotBlank String baseUnit,
        @Size(max = 60) String purchaseUnitLabel,
        @DecimalMin("0.001") BigDecimal purchaseUnitSize,
        @DecimalMin("0.0") BigDecimal costPerBaseUnit,
        /** Yield loss allowance: grinder retention, trim, spillage. */
        @DecimalMin("0.0") BigDecimal wastePct,
        /** PREP only: base units one batch produces. */
        BigDecimal batchYieldBase,
        /**
         * About how many servings one purchase unit yields — "a kilo of beans is 55 drinks".
         * Null leaves it unanswered; a dish can then still be authored in grams, it just
         * cannot be authored by ticking this item.
         */
        @DecimalMin("0.0") BigDecimal servingsPerPack,
        @Size(max = 60) String category,
        /** DAILY | WEEKLY | MONTHLY, or null to keep it out of the cycle-count rotation. */
        String countFrequency,
        /** Allergen names carried by this item; rolled up onto every dish that uses it. */
        List<String> allergens,
        String nutritionJson,
        Long supplierId
) {}
