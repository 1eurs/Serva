package com.cafeqr.stock.dto;

import com.cafeqr.stock.domain.StockMovement;

import java.math.BigDecimal;
import java.time.Instant;

/** One line of the ledger, as the movements view renders it. */
public record MovementResponse(
        Long id,
        Long stockItemId,
        String itemNameEn,
        String itemNameAr,
        String baseUnit,
        BigDecimal deltaBase,
        BigDecimal balanceAfter,
        String reason,
        String wasteReason,
        Long orderId,
        Long userId,
        BigDecimal unitCost,
        String note,
        Instant createdAt
) {
    public static MovementResponse from(StockMovement m, String nameEn, String nameAr, String baseUnit) {
        return new MovementResponse(m.getId(), m.getStockItemId(), nameEn, nameAr, baseUnit,
                m.getDeltaBase(), m.getBalanceAfter(), m.getReason().name(),
                m.getWasteReason() == null ? null : m.getWasteReason().name(),
                m.getOrderId(), m.getUserId(), m.getUnitCost(), m.getNote(), m.getCreatedAt());
    }
}
