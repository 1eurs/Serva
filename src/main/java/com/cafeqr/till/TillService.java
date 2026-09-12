package com.cafeqr.till;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.auth.security.CustomUserDetails;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.orders.domain.OrderStatus;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.payments.repository.PaymentRepository;
import com.cafeqr.till.domain.TillSession;
import com.cafeqr.till.dto.TillDtos.CloseTillRequest;
import com.cafeqr.till.dto.TillDtos.OpenTillRequest;
import com.cafeqr.till.dto.TillDtos.TillSessionResponse;
import com.cafeqr.till.dto.TillDtos.TillStateResponse;
import com.cafeqr.till.repository.TillSessionRepository;
import com.cafeqr.users.domain.Permission;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;

/**
 * The till.
 *
 * <p>A café already answers "are we open?" twice a day with the drawer, and until now the
 * dashboard asked it a third time with a button that recorded nothing. This is the same
 * question with the café's own answer behind it: the shop sells while a counted drawer is
 * open, and closing one means counting it.
 *
 * <p>Two rules carry the whole thing. Only one drawer per branch can be open at a time, which
 * the database enforces rather than this class. And everything a closed session is judged by is
 * written onto it once, at close — {@link #close} snapshots the cash it took rather than
 * leaving a report to re-derive it later, because a refund next week must not move what
 * Tuesday's count was measured against.
 */
@Service
public class TillService {

    /** OMR is held to three decimals everywhere else; the drawer is no different. */
    private static final int SCALE = 3;

    /** Orders that took no money, and so belong in no count. */
    private static final Collection<OrderStatus> NOT_SOLD =
            EnumSet.of(OrderStatus.DECLINED, OrderStatus.CANCELLED);

    /** How many past sessions the history endpoint will hand back at once. */
    private static final int HISTORY_LIMIT = 30;

    private final TillSessionRepository sessions;
    private final BranchService branchService;
    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final AccessGuard accessGuard;

    public TillService(TillSessionRepository sessions,
                       BranchService branchService,
                       OrderRepository orderRepository,
                       PaymentRepository paymentRepository,
                       AccessGuard accessGuard) {
        this.sessions = sessions;
        this.branchService = branchService;
        this.orderRepository = orderRepository;
        this.paymentRepository = paymentRepository;
        this.accessGuard = accessGuard;
    }

    // ============================================================ reading

    @Transactional(readOnly = true)
    public TillStateResponse state(Long branchId) {
        requireBranch(branchId);
        Optional<TillSession> open = sessions.findFirstByBranchIdAndClosedAtIsNull(branchId);

        BigDecimal cash = null;
        BigDecimal card = null;
        BigDecimal expected = null;
        long orders = 0;
        if (open.isPresent()) {
            TillSession session = open.get();
            Instant now = Instant.now();
            orders = orderRepository.countInWindow(branchId, session.getOpenedAt(), now, NOT_SOLD);
            Totals totals = totals(branchId, session.getOpenedAt(), now);
            cash = totals.cash();
            card = totals.card();
            expected = session.getOpeningFloat().add(totals.cash());
        }

        boolean money = canSeeMoney();
        return new TillStateResponse(
                branchId,
                open.isPresent(),
                open.map(TillSessionResponse::from).orElse(null),
                money ? cash : null,
                money ? card : null,
                money ? expected : null,
                orders);
    }

    @Transactional(readOnly = true)
    public List<TillSessionResponse> history(Long branchId) {
        requireBranch(branchId);
        return sessions.findByBranchIdOrderByOpenedAtDesc(branchId, PageRequest.of(0, HISTORY_LIMIT))
                .stream().map(TillSessionResponse::from).toList();
    }

    // ============================================================ opening and closing

    /**
     * Opens the drawer, and with it the shop — for both doors at once. There is no second
     * switch that can leave a café believing it is open while it refuses every customer.
     */
    @Transactional
    public TillSessionResponse open(Long branchId, OpenTillRequest request) {
        Branch branch = requireBranch(branchId);
        branchService.requireActive(branch);
        if (sessions.existsByBranchIdAndClosedAtIsNull(branchId)) {
            throw new ConflictException("The till is already open.");
        }

        CustomUserDetails actor = SecurityUtils.currentUser();
        TillSession session = new TillSession();
        session.setRestaurantId(branch.getRestaurantId());
        session.setBranchId(branchId);
        session.setOpenedAt(Instant.now());
        session.setOpenedBy(actor.getUserId());
        session.setOpenedByName(actor.getUsername());
        session.setOpeningFloat(scaled(request.openingFloat()));

        TillSession saved;
        try {
            saved = sessions.saveAndFlush(session);
        } catch (DataIntegrityViolationException race) {
            // Two tablets, one drawer, same moment. The partial unique index caught it; the
            // loser is told plainly rather than shown a 500, because both people are standing
            // at the same counter and one of them has already opened it.
            throw new ConflictException("The till was just opened on another device.");
        }
        return TillSessionResponse.from(saved);
    }

    /**
     * Counts the drawer and shuts the shop.
     *
     * <p>The count comes from the person; everything it is judged against is computed here and
     * frozen onto the row. Closing does not ask whether there are bills still open on the floor,
     * because a café that needs to cash out at midnight with one table still running must be
     * able to, and a system that refuses is a system people learn to work around.
     */
    @Transactional
    public TillSessionResponse close(Long branchId, CloseTillRequest request) {
        requireBranch(branchId);
        TillSession session = sessions.findFirstByBranchIdAndClosedAtIsNull(branchId)
                .orElseThrow(() -> new ConflictException("The till isn't open."));

        Instant closedAt = Instant.now();
        Totals totals = totals(branchId, session.getOpenedAt(), closedAt);
        BigDecimal counted = scaled(request.countedCash());
        BigDecimal expected = session.getOpeningFloat().add(totals.cash());
        BigDecimal variance = counted.subtract(expected);

        CustomUserDetails actor = SecurityUtils.currentUser();
        session.setClosedAt(closedAt);
        session.setClosedBy(actor.getUserId());
        session.setClosedByName(actor.getUsername());
        session.setCountedCash(counted);
        session.setExpectedCash(expected);
        session.setVariance(variance);
        session.setCashSales(totals.cash());
        session.setCardSales(totals.card());
        session.setOrderCount((int) orderRepository.countInWindow(
                branchId, session.getOpenedAt(), closedAt, NOT_SOLD));
        return TillSessionResponse.from(session);
    }

    // ============================================================ helpers

    /** What the drawer and the card machine took between two moments. */
    private Totals totals(Long branchId, Instant from, Instant to) {
        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal card = BigDecimal.ZERO;
        for (Object[] row : paymentRepository.takenByMethodBetween(branchId, from, to)) {
            String method = String.valueOf(row[0]);
            BigDecimal amount = row[1] == null ? BigDecimal.ZERO : (BigDecimal) row[1];
            if ("CASH".equals(method)) {
                cash = cash.add(amount);
            } else if ("CARD".equals(method)) {
                card = card.add(amount);
            }
        }
        return new Totals(scaled(cash), scaled(card));
    }

    private record Totals(BigDecimal cash, BigDecimal card) {}

    /**
     * Money is gated on PAYMENTS, the permission that already means "handles the café's money",
     * while the state itself is not: whoever works the board needs to know the shop is open, and
     * that is not a cash figure.
     */
    private boolean canSeeMoney() {
        CustomUserDetails user = SecurityUtils.currentUser();
        return user.isPlatformAdmin() || user.hasPermission(Permission.PAYMENTS);
    }

    private Branch requireBranch(Long branchId) {
        Branch branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        return branch;
    }

    private static BigDecimal scaled(BigDecimal value) {
        return value.setScale(SCALE, RoundingMode.HALF_UP);
    }
}
