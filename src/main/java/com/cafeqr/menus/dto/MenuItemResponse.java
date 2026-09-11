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
        Integer preparationTimeMinutes,
        int displayOrder,
        List<String> images,
        List<OptionGroup> optionGroups,
        Instant createdAt,
        Instant updatedAt
) {
    public static MenuItemResponse from(MenuItem i) {
        return new MenuItemResponse(
                i.getId(), i.getRestaurantId(), i.getBranchId(), i.getCategoryId(),
                i.getNameEn(), i.getNameAr(), i.getDescriptionEn(), i.getDescriptionAr(),
                i.getPrice(),
                i.getDiscountType() == null ? null : i.getDiscountType().name(),
                i.getDiscountValue(), i.getDiscountStartsAt(), i.getDiscountEndsAt(),
                i.getImageUrl(), i.isAvailable(),
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
            int displayOrder
    ) {
        public static Option from(MenuItemOption o) {
            return new Option(o.getId(), o.getNameEn(), o.getNameAr(),
                    o.getPriceDelta(), o.getDisplayOrder());
        }
    }
}
