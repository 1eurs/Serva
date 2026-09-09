package com.cafeqr.orders.print.dto;

import com.cafeqr.restaurants.domain.Restaurant;

import java.math.BigDecimal;

/**
 * Everything a print station needs to draw the slip, beyond the order itself.
 *
 * A station has no session and no second round-trip to spend: it pulls a job and must be able
 * to render immediately, offline of everything but the printer. Field names deliberately
 * mirror the frontend's Restaurant type, so the station hands this straight to the renderer
 * without translating it.
 */
public record ReceiptContext(
        String name,
        String nameEn,
        String nameAr,
        String logoUrl,
        String phone,
        boolean vatEnabled,
        BigDecimal vatRate,
        /** The café's receipt customisation document — style, language, footer, VAT/CR numbers. */
        String receiptSettingsJson,
        /** Resolved here because the order carries only a table id. */
        String tableNumber
) {
    public static ReceiptContext of(Restaurant r, String tableNumber) {
        return new ReceiptContext(r.getName(), r.getNameEn(), r.getNameAr(), r.getLogoUrl(), r.getPhone(),
                r.isVatEnabled(), r.getVatRate(), r.getReceiptSettingsJson(), tableNumber);
    }
}
