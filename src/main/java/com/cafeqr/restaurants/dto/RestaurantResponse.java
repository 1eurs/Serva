package com.cafeqr.restaurants.dto;

import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.restaurants.domain.Restaurant;

import java.math.BigDecimal;
import java.time.Instant;

public record RestaurantResponse(
        Long id,
        String name,
        String slug,
        String logoUrl,
        String phone,
        String email,
        String instagramUrl,
        String currency,
        boolean vatEnabled,
        BigDecimal vatRate,
        boolean paymentMethodSelectionEnabled,
        boolean disposablesForDineIn,
        /** False means stock warns about sold-out items but never hides them itself. */
        boolean autoHideOutOfStock,
        String theme,
        String themeCustomJson,
        String receiptSettingsJson,
        boolean active,
        boolean premiumLook,
        Plan plan,
        Instant createdAt,
        Instant updatedAt
) {
    public static RestaurantResponse from(Restaurant r) {
        return new RestaurantResponse(
                r.getId(), r.getName(), r.getSlug(), r.getLogoUrl(), r.getPhone(), r.getEmail(),
                r.getInstagramUrl(), r.getCurrency(), r.isVatEnabled(), r.getVatRate(),
                r.isPaymentMethodSelectionEnabled(), r.isDisposablesForDineIn(), r.isAutoHideOutOfStock(),
                r.getTheme(), r.getThemeCustomJson(),
                r.getReceiptSettingsJson(), r.isActive(),
                r.isPremiumLook(), r.getPlan(), r.getCreatedAt(), r.getUpdatedAt());
    }
}
