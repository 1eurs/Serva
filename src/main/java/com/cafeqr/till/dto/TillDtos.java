package com.cafeqr.till.dto;

import com.cafeqr.till.domain.TillMovement;
import com.cafeqr.till.domain.TillMovement.Direction;
import com.cafeqr.till.domain.TillSession;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Everything the till says and is told. */
public final class TillDtos {

    private TillDtos() {}

    /** Opening the drawer: what is in it right now. Zero is a legitimate answer. */
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
            BigDecimal countedCash
    ) {}

    /**
     * Recording cash that came or went between the two counts: how much, which way, and why. The
     * reason is required — a drawer short by five is a mistake, short by five "for milk" is a
     * receipt.
     */
    public record AddMovementRequest(
            @NotNull @DecimalMin("0.001") @DecimalMax("100000") @Digits(integer = 6, fraction = 3)
            BigDecimal amount,
            @NotNull Direction direction,
            @NotBlank @Size(max = 200) String note
    ) {}

    /** One cash movement, as the sheet lists it. */
    public record MovementResponse(
            Long id,
            String direction,
            BigDecimal amount,
            String note,
            String by,
            Instant at
    ) {
        public static MovementResponse from(TillMovement m) {
            return new MovementResponse(
                    m.getId(), m.getDirection().name(), m.getAmount(), m.getNote(),
                    m.getCreatedByName(), m.getCreatedAt());
        }
    }

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
            BigDecimal paidOut,
            BigDecimal paidIn,
            Integer orderCount
    ) {
        public static TillSessionResponse from(TillSession s) {
            return new TillSessionResponse(
                    s.getId(), s.getBranchId(), s.getOpenedAt(), s.getOpenedByName(), s.getOpeningFloat(),
                    s.getClosedAt(), s.getClosedByName(), s.getCountedCash(), s.getExpectedCash(),
                    s.getVariance(), s.getCashSales(), s.getCardSales(),
                    s.getCashPaidOut(), s.getCashPaidIn(), s.getOrderCount());
        }
    }

    /**
     * The whole state of one branch's till, in the shape the header switch needs to draw itself
     * without asking three questions.
     *
     * @param open             whether a session is running, which is the whole of "can this
     *                         shop sell right now" — there is no second switch.
     * @param cashTaken        cash this session has taken so far. Null for anyone without the
     *                         Payments permission, as are the other money figures.
     * @param expectedCash     float plus cash taken, less what was paid out, plus what was paid
     *                         in: what should be in the drawer right now.
     * @param paidOut          cash taken out of the drawer this session; {@code paidIn} the cash
     *                         added. Null, like the other money figures, without the Payments
     *                         permission.
     * @param movements        the session's cash movements, newest first — empty without Payments.
     */
    public record TillStateResponse(
            Long branchId,
            boolean open,
            TillSessionResponse session,
            BigDecimal cashTaken,
            BigDecimal cardTaken,
            BigDecimal expectedCash,
            BigDecimal paidOut,
            BigDecimal paidIn,
            List<MovementResponse> movements,
            long orderCount
    ) {}
}
