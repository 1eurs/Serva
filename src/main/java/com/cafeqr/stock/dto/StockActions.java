package com.cafeqr.stock.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/**
 * The handful of things staff do to stock during a shift. Grouped in one file because they are
 * one workflow — "what arrived, what got thrown away, what the shelf actually says".
 */
public final class StockActions {

    private StockActions() {
    }

    /** A delivery. Quantities are base units; the client converts from bags/cartons. */
    public record ReceiveRequest(
            Long branchId,
            @NotNull @Size(min = 1, max = 200) List<Line> lines,
            @Size(max = 300) String note
    ) {
        public record Line(
                @NotNull Long stockItemId,
                @NotNull @DecimalMin("0.001") BigDecimal quantityBase,
                /** What it cost per base unit this time; null keeps the running average. */
                BigDecimal unitCost
        ) {}
    }

    /** Something got spilled, expired, comped or eaten by staff. */
    public record WasteRequest(
            Long branchId,
            @NotNull Long stockItemId,
            @NotNull @DecimalMin("0.001") BigDecimal quantityBase,
            /** SPILLED | EXPIRED | STAFF_MEAL | COMP | TRAINING | DAMAGED | OTHER. */
            String reason,
            @Size(max = 300) String note
    ) {}

    /** "The shelf says 820 g" — sets on-hand outright and records the difference. */
    public record AdjustRequest(
            Long branchId,
            @NotNull Long stockItemId,
            @NotNull @DecimalMin("0.0") BigDecimal quantityBase,
            @Size(max = 300) String note,
            /**
             * True when somebody set this figure by looking at the shelf.
             *
             * <p>Both things that write here are absolute — "the shelf holds this much" — but
             * they are not the same event. Walking the shelf is a count; typing over a figure
             * because a delivery went unlogged is a correction, and the history has to be able
             * to tell an owner which one they are reading. Defaults to a correction, so an
             * older client keeps the behaviour it had.
             */
            Boolean counted
    ) {}

    /** Moving stock to another branch. */
    public record TransferRequest(
            @NotNull Long fromBranchId,
            @NotNull Long toBranchId,
            @NotNull Long stockItemId,
            @NotNull @DecimalMin("0.001") BigDecimal quantityBase,
            @Size(max = 300) String note
    ) {}

    /** "I baked a tray": draws a prep item's recipe and adds its yield. */
    public record ProduceRequest(
            Long branchId,
            @NotNull Long prepItemId,
            @NotNull @DecimalMin("0.001") BigDecimal batches,
            @Size(max = 300) String note
    ) {}

    /** Alert threshold and restock target for one item at one branch. */
    public record LevelsRequest(
            Long branchId,
            BigDecimal parLevelBase,
            BigDecimal reorderPointBase
    ) {}
}
