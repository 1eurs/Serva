package com.cafeqr.stock.dto;

import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Everything the shelf is asked and everything it answers. Four small records, kept together
 * because they are one screen's worth of vocabulary and reading them apart hides how little
 * the feature actually asks for.
 *
 * <p>The ceiling on every quantity is the column's own: {@code NUMERIC(14,3)} holds eleven
 * digits before the point, so a figure past that is a typo rather than a stockroom, and it is
 * refused here with a message rather than by the driver with a stack trace.
 */
public final class StockDtos {

    /** Eleven integer digits is what NUMERIC(14,3) holds. Past it, somebody leaned on a key. */
    private static final String MAX = "99999999999";

    private StockDtos() {
    }

    /**
     * A new thing on the shelf.
     *
     * <p>One name, in whichever language it was typed — {@code com.cafeqr.common.util.Names}
     * files it by its own script. This list is the owner's own, never the customer's, so
     * nobody is made to write "Milk" twice in order to save it once.
     */
    public record CreateStockItemRequest(
            @Size(max = 150) String name,
            @Size(max = 150) String nameEn,
            @Size(max = 150) String nameAr,
            @NotNull StockUnit unit,
            /** How much is there right now. Absent means none yet — an item can be set up empty. */
            @PositiveOrZero @DecimalMax(MAX) BigDecimal quantity,
            @PositiveOrZero @DecimalMax(MAX) BigDecimal reorderPoint,
            @PositiveOrZero @DecimalMax(MAX) BigDecimal unitPrice
    ) {}

    /**
     * Editing the thing itself — not what is on the shelf.
     *
     * <p>Quantity is deliberately absent: it moves through {@code receive} or {@code count},
     * each of which says which of the two very different things happened. An edit form that
     * could also change the number would let a rename quietly restate the stock.
     *
     * <p>Unlike the usual PATCH here, {@code reorderPoint} and {@code unitPrice} are replaced
     * by what arrives, so null clears them — the form shows both fields and emptying one is
     * the only way to say "I don't want a line on this any more".
     */
    public record UpdateStockItemRequest(
            @Size(max = 150) String name,
            @Size(max = 150) String nameEn,
            @Size(max = 150) String nameAr,
            @NotNull StockUnit unit,
            @PositiveOrZero @DecimalMax(MAX) BigDecimal reorderPoint,
            @PositiveOrZero @DecimalMax(MAX) BigDecimal unitPrice
    ) {}

    /**
     * Something arrived. The one action the wall exists to make cheap.
     *
     * <p>A price may ride along because a delivery is when the invoice is in somebody's hand;
     * it updates what a unit costs from then on. Leaving it out changes nothing.
     */
    public record ReceiveRequest(
            @NotNull @Positive @DecimalMax(MAX) BigDecimal amount,
            @PositiveOrZero @DecimalMax(MAX) BigDecimal unitPrice
    ) {}

    /** Somebody looked and the number was wrong. This replaces it; it does not add to it. */
    public record CountRequest(
            @NotNull @PositiveOrZero @DecimalMax(MAX) BigDecimal quantity
    ) {}

    /**
     * One item as the wall reads it.
     *
     * <p>No {@code low} or {@code out} flag: whether a tile is under its line is drawn from
     * the quantity and the line, and the browser has both. Sending the verdict as well would
     * make it possible for the number and the colour to disagree.
     */
    public record StockItemResponse(
            Long id,
            Long branchId,
            String nameEn,
            String nameAr,
            StockUnit unit,
            BigDecimal quantity,
            BigDecimal reorderPoint,
            BigDecimal unitPrice,
            Instant lastMovedAt,
            Instant createdAt
    ) {
        public static StockItemResponse from(StockItem i) {
            return new StockItemResponse(
                    i.getId(), i.getBranchId(), i.getNameEn(), i.getNameAr(), i.getUnit(),
                    i.getQuantity(), i.getReorderPoint(), i.getUnitPrice(),
                    i.getLastMovedAt(), i.getCreatedAt());
        }
    }
}
