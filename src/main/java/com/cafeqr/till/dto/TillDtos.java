package com.cafeqr.till.dto;

import com.cafeqr.till.domain.TillSession;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

/** Everything the till says and is told. */
public final class TillDtos {

    private TillDtos() {}

    /**
     * Opening the drawer. The float is the only thing asked for, and it is asked for every time
     * — a café that leaves its change in overnight gets last night's count filled in for it
     * (see {@code tillCarryFloat}), so agreeing is one tap and disagreeing is still possible.
     */
    public record OpenTillRequest(
            @NotNull @DecimalMin("0") @DecimalMax("100000") @Digits(integer = 6, fraction = 3)
            BigDecimal openingFloat
    ) {}

    /**
     * Closing it. {@code countedCash} is what a person found in the drawer, not what the system
     * thinks should be there — the difference between those two is the entire point.
     */
    public record CloseTillRequest(
            @NotNull @DecimalMin("0") @DecimalMax("1000000") @Digits(integer = 7, fraction = 3)
            BigDecimal countedCash,
            @Size(max = 500) String note
    ) {}

    /** One session, open or closed. The closed half of the fields is null while it runs. */
    public record TillSessionResponse(
            Long id,
            Long branchId,
            Instant openedAt,
            String openedBy,
            BigDecimal openingFloat,
            Instant closedAt,
            String closedBy,
            BigDecimal countedCash,
            BigDecimal expectedCash,
            BigDecimal variance,
            BigDecimal cashSales,
            BigDecimal cardSales,
            Integer orderCount,
            String closeNote
    ) {
        public static TillSessionResponse from(TillSession s) {
            return new TillSessionResponse(
                    s.getId(), s.getBranchId(), s.getOpenedAt(), s.getOpenedByName(), s.getOpeningFloat(),
                    s.getClosedAt(), s.getClosedByName(), s.getCountedCash(), s.getExpectedCash(),
                    s.getVariance(), s.getCashSales(), s.getCardSales(), s.getOrderCount(), s.getCloseNote());
        }
    }

    /**
     * The whole state of one branch's till, in the shape the header switch needs to draw itself
     * without asking three questions.
     *
     * @param open             whether a session is running. When {@code tillEnabled} is false
     *                         this is always true: that café opted out of the drawer, and the
     *                         switch goes back to being a plain pause.
     * @param acceptingOrders  whether a customer's order would be taken right now — the till and
     *                         the pause, already combined.
     * @param cashTaken        cash this session has taken so far. Null under a blind count while
     *                         the session is open: a cashier who can watch the expected figure
     *                         all shift is not counting a drawer at closing, they are copying it.
     * @param expectedCash     float plus cash taken. Null for the same reason, and it is the
     *                         figure the blind count is actually hiding.
     * @param openTabs         bills still unpaid on the floor. Shown because cash nobody has
     *                         handed over yet cannot be in the drawer, and a count that is short
     *                         for that reason is not a mistake.
     * @param suggestedFloat   what to prefill the opening float with, or null to start empty.
     * @param lastClose        the previous session's count, so "we were 2 rials short last night"
     *                         is visible where it matters rather than in a report nobody opens.
     */
    public record TillStateResponse(
            Long branchId,
            boolean tillEnabled,
            boolean open,
            boolean acceptingOrders,
            Instant pauseUntil,
            boolean blindCount,
            BigDecimal noteOver,
            TillSessionResponse session,
            BigDecimal cashTaken,
            BigDecimal cardTaken,
            BigDecimal expectedCash,
            long orderCount,
            long openTabs,
            BigDecimal suggestedFloat,
            TillSessionResponse lastClose
    ) {}
}
