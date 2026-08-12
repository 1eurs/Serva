package com.cafeqr.stock.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Suppliers, reorder suggestions and purchase orders. */
public final class PurchasingDtos {

    private PurchasingDtos() {
    }

    public record SupplierRequest(
            @NotBlank @Size(max = 150) String name,
            @Size(max = 40) String phone,
            @Size(max = 150) String email,
            @Size(max = 500) String notes,
            boolean active
    ) {}

    public record SupplierResponse(Long id, String name, String phone, String email,
                                   String notes, boolean active) {}

    /** "You're below par on this — buy roughly this much." */
    public record SuggestionResponse(
            Long stockItemId,
            String nameEn,
            String nameAr,
            String baseUnit,
            String purchaseUnitLabel,
            BigDecimal purchaseUnitSize,
            BigDecimal onHand,
            BigDecimal reorderPoint,
            BigDecimal parLevel,
            BigDecimal suggestedBase,
            /** The same figure in the unit the café actually orders in. */
            BigDecimal suggestedPurchaseUnits,
            Long supplierId
    ) {}

    public record OrderRequest(
            Long branchId,
            Long supplierId,
            LocalDate expectedAt,
            @Size(max = 60) String reference,
            @Size(max = 500) String notes,
            @NotNull @Size(min = 1, max = 200) List<Line> lines
    ) {
        public record Line(
                @NotNull Long stockItemId,
                @NotNull @DecimalMin("0.001") BigDecimal quantityBase,
                BigDecimal unitCost
        ) {}
    }

    public record ReceiveLineRequest(
            @NotNull Long lineId,
            @NotNull @DecimalMin("0.001") BigDecimal quantityBase,
            /** What it actually cost this time; feeds the running average. */
            BigDecimal unitCost
    ) {}

    public record OrderResponse(
            Long id,
            Long branchId,
            Long supplierId,
            String supplierName,
            String status,
            String reference,
            String notes,
            LocalDate expectedAt,
            Instant createdAt,
            BigDecimal totalCost,
            List<Line> lines
    ) {
        public record Line(
                Long id,
                Long stockItemId,
                String nameEn,
                String nameAr,
                String baseUnit,
                BigDecimal quantityBase,
                BigDecimal quantityReceivedBase,
                BigDecimal outstandingBase,
                BigDecimal unitCost
        ) {}
    }
}
