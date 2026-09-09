package com.cafeqr.stock.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/** Reading and writing a menu item's bill of materials, and the costing that falls out of it. */
public final class RecipeDtos {

    private RecipeDtos() {
    }

    /** One ingredient line. Quantity may be negative on an option — options are deltas. */
    public record Line(
            @NotNull Long stockItemId,
            @NotNull BigDecimal quantityBase,
            /** ALL | DINE_IN | CAR; defaults to ALL. */
            String orderTypeScope
    ) {}

    /** A modifier's stock deltas — "extra shot" adds beans, "large" swaps the cup. */
    public record OptionRecipe(
            @NotNull Long optionId,
            List<Line> lines,
            /** Disposables this choice implies; null clears it. */
            Long packagingRuleId
    ) {}

    /**
     * The whole stock configuration for one menu item, saved in a single call so the editor
     * never leaves the item half-configured.
     */
    public record SaveRequest(
            /** NONE | DAILY_LIMIT | SIMPLE | RECIPE. */
            @NotNull String stockMode,
            /** SIMPLE: an existing countable good, or null to have one created from the item's name. */
            Long stockItemId,
            /** DAILY_LIMIT: the cap. */
            Integer dailyLimit,
            List<Line> lines,
            List<OptionRecipe> optionRecipes,
            Long packagingRuleId
    ) {}

    /** What the editor renders, including the numbers that make the data entry worth it. */
    public record Response(
            Long menuItemId,
            String stockMode,
            Long stockItemId,
            Integer dailyLimit,
            Integer remainingToday,
            Long packagingRuleId,
            List<Line> lines,
            List<OptionRecipe> optionRecipes,
            /** Ingredient cost of one unit at current average costs. */
            BigDecimal plateCost,
            /** Cost of the disposables one serving burns, where a rule is mapped. */
            BigDecimal packagingCost,
            BigDecimal price,
            /** Plate cost as a percent of price — the number the trade manages by. */
            BigDecimal foodCostPercent,
            BigDecimal margin,
            List<String> allergens
    ) {}

    /**
     * One menu item seen from the shelf's side: what a sale takes off it, what that costs, and
     * how often it actually sells.
     *
     * <p>This is the row the Stock page needs and the recipe endpoint could never give: the
     * question there is "how is this dish built?", asked one dish at a time from the menu
     * editor. The question here is the one an owner cannot answer today — "does <em>anything</em>
     * I sell come off my shelf?" — and it is only answerable across the whole menu at once.
     *
     * <p>Deliberately carries no name or price. The dashboard already holds the menu, so
     * repeating them here would be a second copy to keep bilingual and in step; the client
     * joins on {@code menuItemId}.
     */
    public record MenuLink(
            Long menuItemId,
            /** NONE | DAILY_LIMIT | SIMPLE | RECIPE. */
            String stockMode,
            Integer dailyLimit,
            /** Empty for an item that draws nothing — which is the state worth seeing. */
            List<Take> takes,
            BigDecimal plateCost,
            BigDecimal foodCostPercent,
            /** Units sold in the recent window, so setup can start with what actually sells. */
            long soldRecently
    ) {
        /**
         * One draw a single sale makes.
         *
         * <p>{@code neverCounted} is the difference between a number and a guess: an ingredient
         * with no count on record at this branch is wired up but unmeasured, and everything
         * downstream of it — cover, value, the reorder list — is fiction until someone counts
         * it. Shown rather than hidden, because a wired-but-unmeasured shelf looks identical to
         * a working one otherwise.
         */
        public record Take(Long stockItemId, String nameEn, String nameAr, String baseUnit,
                           BigDecimal quantityBase, boolean neverCounted) {}
    }

    /** A reusable bundle of disposables: cup + lid + sleeve. */
    public record PackagingRuleRequest(
            @Size(max = 120) String nameEn,
            @Size(max = 120) String nameAr,
            int displayOrder,
            List<Line> lines
    ) {}

    public record PackagingRuleResponse(
            Long id,
            String nameEn,
            String nameAr,
            int displayOrder,
            List<Line> lines,
            /** What one serving of this packaging costs — cups add up faster than owners expect. */
            BigDecimal cost
    ) {}

    /** A prep item's own recipe: what one batch is made from. */
    public record PrepRecipeRequest(List<Line> lines) {}
}
