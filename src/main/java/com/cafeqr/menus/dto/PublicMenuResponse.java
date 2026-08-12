package com.cafeqr.menus.dto;

import com.cafeqr.branches.domain.Branch;
import com.cafeqr.menus.domain.MenuCategory;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemImage;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.tables.domain.RestaurantTable;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Bilingual public menu payload served to customers after scanning a QR code. */
public record PublicMenuResponse(
        PublicRestaurant restaurant,
        PublicBranch branch,
        PublicTable table,
        List<PublicCategory> categories
) {

    public record PublicRestaurant(
            Long id,
            String name,
            String slug,
            String logoUrl,
            String phone,
            String instagramUrl,
            String currency,
            boolean vatEnabled,
            BigDecimal vatRate,
            String theme,
            String themeCustomJson
    ) {
        public static PublicRestaurant from(Restaurant r) {
            return new PublicRestaurant(r.getId(), r.getName(), r.getSlug(), r.getLogoUrl(),
                    r.getPhone(), r.getInstagramUrl(), r.getCurrency(), r.isVatEnabled(), r.getVatRate(),
                    r.getTheme(), r.getThemeCustomJson());
        }
    }

    public record PublicBranch(
            Long id,
            String name,
            String address,
            String phone,
            String openingHours,
            boolean acceptingOrders
    ) {
        public static PublicBranch from(Branch b) {
            if (b == null) {
                return null;
            }
            return new PublicBranch(b.getId(), b.getName(), b.getAddress(), b.getPhone(),
                    b.getOpeningHours(), b.isAcceptingOrders());
        }
    }

    public record PublicTable(
            Long id,
            String tableNumber,
            String qrCodeToken
    ) {
        public static PublicTable from(RestaurantTable t) {
            if (t == null) {
                return null;
            }
            return new PublicTable(t.getId(), t.getTableNumber(), t.getQrCodeToken());
        }
    }

    public record PublicCategory(
            Long id,
            String nameEn,
            String nameAr,
            String descriptionEn,
            String descriptionAr,
            int displayOrder,
            List<PublicItem> items
    ) {
        public static PublicCategory of(MenuCategory c, List<PublicItem> items) {
            return new PublicCategory(c.getId(), c.getNameEn(), c.getNameAr(),
                    c.getDescriptionEn(), c.getDescriptionAr(), c.getDisplayOrder(), items);
        }
    }

    public record PublicItem(
            Long id,
            String nameEn,
            String nameAr,
            String descriptionEn,
            String descriptionAr,
            BigDecimal price,
            /** Discounted base price when a discount is currently active; null otherwise. */
            BigDecimal salePrice,
            String imageUrl,
            List<String> images,
            boolean available,
            /**
             * Ran out rather than switched off: the ingredients aren't there, or today's limit
             * is used up. Deliberately a plain sold-out flag and not a "only 2 left!" counter —
             * a stale scarcity number costs more trust than it wins orders.
             */
            boolean soldOut,
            Integer preparationTimeMinutes,
            int displayOrder,
            /** Rolled up from the recipe, so the badge is right without anyone maintaining it. */
            List<String> allergens,
            List<PublicOptionGroup> optionGroups
    ) {
        public static PublicItem from(MenuItem i, Instant now, boolean soldOut, List<String> allergens) {
            BigDecimal salePrice = i.discountActive(now) ? i.effectivePrice(now) : null;
            return new PublicItem(i.getId(), i.getNameEn(), i.getNameAr(),
                    i.getDescriptionEn(), i.getDescriptionAr(), i.getPrice(), salePrice, i.getImageUrl(),
                    i.getImages().stream().map(MenuItemImage::getUrl).toList(),
                    i.isAvailable(), soldOut, i.getPreparationTimeMinutes(), i.getDisplayOrder(),
                    allergens,
                    i.getOptionGroups().stream().map(PublicOptionGroup::from).toList());
        }
    }

    public record PublicOptionGroup(
            Long id,
            String nameEn,
            String nameAr,
            String selectionType,
            boolean required,
            int displayOrder,
            List<PublicOption> options
    ) {
        public static PublicOptionGroup from(MenuItemOptionGroup g) {
            return new PublicOptionGroup(g.getId(), g.getNameEn(), g.getNameAr(),
                    g.getSelectionType().name(), g.isRequired(), g.getDisplayOrder(),
                    g.getOptions().stream().map(PublicOption::from).toList());
        }
    }

    public record PublicOption(
            Long id,
            String nameEn,
            String nameAr,
            BigDecimal priceDelta,
            int displayOrder
    ) {
        public static PublicOption from(MenuItemOption o) {
            return new PublicOption(o.getId(), o.getNameEn(), o.getNameAr(),
                    o.getPriceDelta(), o.getDisplayOrder());
        }
    }
}
