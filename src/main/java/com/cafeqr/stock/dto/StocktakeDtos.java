package com.cafeqr.stock.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Physical counts: opening one, filling it in, and reading the variance it found. */
public final class StocktakeDtos {

    private StocktakeDtos() {
    }

    public record OpenRequest(
            Long branchId,
            /** FULL counts everything; CYCLE counts only what is due in the rotation. */
            String scope,
            /**
             * Hide the expected quantity while counting. On by default and worth leaving on:
             * a visible expectation is what turns a count into a rubber stamp.
             */
            Boolean blind,
            @Size(max = 500) String notes
    ) {}

    public record CountLineRequest(
            @NotNull Long stockItemId,
            /** What was actually found; null clears the count for that line. */
            BigDecimal countedBase
    ) {}

    public record Response(
            Long id,
            Long branchId,
            String status,
            String scope,
            boolean blind,
            String notes,
            Instant createdAt,
            Instant closedAt,
            long remainingLines,
            /** Money value of the variance found; negative means stock went missing. */
            BigDecimal varianceValue,
            List<Line> lines
    ) {
        public record Line(
                Long stockItemId,
                String nameEn,
                String nameAr,
                String baseUnit,
                /** Null while a blind count is still open — that is the entire point of blind. */
                BigDecimal expectedBase,
                BigDecimal countedBase,
                BigDecimal variance,
                BigDecimal varianceValue
        ) {}
    }
}
