package com.cafeqr.menus.dto;

import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemImage;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record MenuItemResponse(
        Long id,
        Long restaurantId,
        Long branchId,
        Long categoryId,
        String nameEn,
        String nameAr,
        String descriptionEn,
        String descriptionAr,
        BigDecimal price,
        String discountType,
        BigDecimal discountValue,
        Instant discountStartsAt,
        Instant discountEndsAt,
        String imageUrl,
        boolean available,
        /** NONE | DAILY_LIMIT | SIMPLE | RECIPE — see {@code StockMode}. Configured via the stock API. */
        String stockMode,
        /** SIMPLE mode: the countable good backing this item. */
        Long stockItemId,
        Integer dailyLimit,
        /** How many are still sellable today under a daily cap; null when not capped. */
        Integer remainingToday,
        /**
         * Why the branch in view cannot make this right now, or null when it can. Not a
         * decision anybody made — see {@link SoldOut}.
         */
        SoldOut soldOut,
        Long packagingRuleId,
        Integer preparationTimeMinutes,
        int displayOrder,
        List<String> images,
        List<OptionGroup> optionGroups,
        Instant createdAt,
        Instant updatedAt
) {
    /**
     * Stock has run the item off the menu, without anybody switching it off.
     *
     * <p>{@code available} is the owner's own decision and is restaurant-wide; this is a
     * measurement of one branch's shelf, taken fresh on every read. The two together are what
     * the customer actually sees, so a dashboard that shows only the first tells an owner
     * their latte is on sale while every order for it is being refused.
     *
     * <p>Carries the blocking ingredient's two names rather than one: the row is read on a
     * screen that is entirely Arabic or entirely English.
     *
     * @param reason OUT_OF_STOCK or DAILY_LIMIT_REACHED
     */
    public record SoldOut(String reason, String blockerNameEn, String blockerNameAr) {}

    /** Without a branch in hand there is no daily-limit figure to give; see the overload. */
    public static MenuItemResponse from(MenuItem i) {
        return from(i, null, null);
    }

    /**
     * @param remainingToday how many are still sellable at the branch being viewed, or null
     *                       when the item is uncapped or no single branch is in view. The cap
     *                       is restaurant-wide but the tally against it is not, so this figure
     *                       is meaningless without saying where.
     * @param soldOut        why that same branch cannot make it right now, or null when it can
     *                       — and equally null when no single branch is in view, for the same
     *                       reason: a shelf belongs to a branch, not to a restaurant.
     */
    public static MenuItemResponse from(MenuItem i, Integer remainingToday, SoldOut soldOut) {
        return new MenuItemResponse(
                i.getId(), i.getRestaurantId(), i.getBranchId(), i.getCategoryId(),
                i.getNameEn(), i.getNameAr(), i.getDescriptionEn(), i.getDescriptionAr(),
                i.getPrice(),
                i.getDiscountType() == null ? null : i.getDiscountType().name(),
                i.getDiscountValue(), i.getDiscountStartsAt(), i.getDiscountEndsAt(),
                i.getImageUrl(), i.isAvailable(),
                i.getStockMode().name(), i.getStockItemId(), i.getDailyLimit(),
                remainingToday,
                soldOut,
                i.getPackagingRuleId(),
                i.getPreparationTimeMinutes(),
                i.getDisplayOrder(),
                i.getImages().stream().map(MenuItemImage::getUrl).toList(),
                i.getOptionGroups().stream().map(OptionGroup::from).toList(),
                i.getCreatedAt(), i.getUpdatedAt());
    }

    public record OptionGroup(
            Long id,
            String nameEn,
            String nameAr,
            String selectionType,
            boolean required,
            int displayOrder,
            List<Option> options
    ) {
        public static OptionGroup from(MenuItemOptionGroup g) {
            return new OptionGroup(g.getId(), g.getNameEn(), g.getNameAr(),
                    g.getSelectionType().name(), g.isRequired(), g.getDisplayOrder(),
                    g.getOptions().stream().map(Option::from).toList());
        }
    }

    public record Option(
            Long id,
            String nameEn,
            String nameAr,
            BigDecimal priceDelta,
            int displayOrder,
            /** Disposables this choice implies — the size the customer picks decides the cup. */
            Long packagingRuleId
    ) {
        public static Option from(MenuItemOption o) {
            return new Option(o.getId(), o.getNameEn(), o.getNameAr(),
                    o.getPriceDelta(), o.getDisplayOrder(), o.getPackagingRuleId());
        }
    }
}
