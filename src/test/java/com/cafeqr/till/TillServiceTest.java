package com.cafeqr.till;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.auth.security.CustomUserDetails;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.payments.repository.PaymentRepository;
import com.cafeqr.till.domain.TillSession;
import com.cafeqr.till.dto.TillDtos.CloseTillRequest;
import com.cafeqr.till.dto.TillDtos.OpenTillRequest;
import com.cafeqr.till.dto.TillDtos.TillSessionResponse;
import com.cafeqr.till.dto.TillDtos.TillStateResponse;
import com.cafeqr.till.repository.TillSessionRepository;
import com.cafeqr.users.domain.Permission;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * The till's arithmetic and the two rules it enforces: one open drawer per branch, and a count
 * that has to be explained when it is wrong.
 */
@ExtendWith(MockitoExtension.class)
class TillServiceTest {

    @Mock private TillSessionRepository sessions;
    @Mock private BranchService branchService;
    @Mock private OrderRepository orderRepository;
    @Mock private PaymentRepository paymentRepository;
    @Mock private AccessGuard accessGuard;

    private TillService tillService;
    private Branch branch;

    @BeforeEach
    void setUp() {
        tillService = new TillService(sessions, branchService, orderRepository, paymentRepository, accessGuard);

        branch = new Branch();
        branch.setId(2L);
        branch.setRestaurantId(1L);
        branch.setActive(true);
        lenient().when(branchService.getEntity(2L)).thenReturn(branch);
        lenient().when(sessions.saveAndFlush(any(TillSession.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        lenient().when(orderRepository.countInWindow(anyLong(), any(), any(), anyCollection())).thenReturn(0L);
        lenient().when(orderRepository.countOpenTabsSince(anyLong(), any(), any(), anyCollection())).thenReturn(0L);
        lenient().when(paymentRepository.takenByMethodBetween(anyLong(), any(), any())).thenReturn(List.of());

        authenticate(EnumSet.of(Permission.ORDERS, Permission.PAYMENTS));
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    // ---------------- opening ----------------

    @Test
    void openingTheTillRecordsWhoCountedTheFloatAndResumesOrdering() {
        // Last night ended on a pause that nobody lifted — the exact state that used to leave a
        // café open for business and refusing every customer.
        branch.setAcceptingOrders(false);

        TillSessionResponse opened = tillService.open(2L, new OpenTillRequest(new BigDecimal("20")));

        assertThat(opened.openingFloat()).isEqualByComparingTo("20.000");
        assertThat(opened.openedBy()).isEqualTo("user7");
        assertThat(opened.closedAt()).isNull();
        assertThat(branch.isAcceptingOrders()).isTrue();
    }

    @Test
    void aSecondDrawerCannotBeOpenedOnTopOfTheFirst() {
        when(sessions.existsByBranchIdAndClosedAtIsNull(2L)).thenReturn(true);

        assertThatThrownBy(() -> tillService.open(2L, new OpenTillRequest(BigDecimal.TEN)))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void aBranchThatRunsNoDrawerCannotOpenOne() {
        branch.setTillEnabled(false);

        assertThatThrownBy(() -> tillService.open(2L, new OpenTillRequest(BigDecimal.TEN)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Settings");
    }

    // ---------------- closing ----------------

    @Test
    void closingCountsTheFloatPlusTheCashAndNamesTheDifference() {
        openSessionWith(new BigDecimal("20.000"));
        takings("47.500", "132.000");

        TillSessionResponse closed = tillService.close(2L, new CloseTillRequest(new BigDecimal("67.500"), null));

        assertThat(closed.cashSales()).isEqualByComparingTo("47.500");
        assertThat(closed.cardSales()).isEqualByComparingTo("132.000");
        // 20 in the drawer at the start, 47.500 taken, 67.500 counted: nothing missing.
        assertThat(closed.expectedCash()).isEqualByComparingTo("67.500");
        assertThat(closed.variance()).isEqualByComparingTo("0.000");
        assertThat(closed.closedBy()).isEqualTo("user7");
    }

    @Test
    void aShortDrawerIsNegativeAndAnOverDrawerIsPositive() {
        openSessionWith(new BigDecimal("10.000"));
        takings("40.000", "0");

        TillSessionResponse shortDrawer =
                tillService.close(2L, new CloseTillRequest(new BigDecimal("49.500"), "gave wrong change"));
        assertThat(shortDrawer.variance()).isEqualByComparingTo("-0.500");

        openSessionWith(new BigDecimal("10.000"));
        TillSessionResponse overDrawer =
                tillService.close(2L, new CloseTillRequest(new BigDecimal("50.250"), "found a coin"));
        assertThat(overDrawer.variance()).isEqualByComparingTo("0.250");
    }

    @Test
    void adrawerOutByMoreThanTheThresholdHasToBeExplained() {
        branch.setTillNoteOver(new BigDecimal("1.000"));
        openSessionWith(new BigDecimal("10.000"));
        takings("40.000", "0");

        assertThatThrownBy(() -> tillService.close(2L, new CloseTillRequest(new BigDecimal("45.000"), null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("5.000");

        // Under the threshold, nobody is made to write a sentence about a rounded rial.
        assertThatCode(() -> tillService.close(2L, new CloseTillRequest(new BigDecimal("49.500"), null)))
                .doesNotThrowAnyException();
    }

    @Test
    void aCafeThatNeverWantsToExplainItselfSetsNoThreshold() {
        branch.setTillNoteOver(null);
        openSessionWith(new BigDecimal("10.000"));
        takings("40.000", "0");

        assertThatCode(() -> tillService.close(2L, new CloseTillRequest(BigDecimal.ZERO, null)))
                .doesNotThrowAnyException();
    }

    @Test
    void closingATillThatIsNotOpenIsRefused() {
        when(sessions.findFirstByBranchIdAndClosedAtIsNull(2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tillService.close(2L, new CloseTillRequest(BigDecimal.TEN, null)))
                .isInstanceOf(ConflictException.class);
    }

    // ---------------- what the screen is told ----------------

    @Test
    void aBlindCountHidesTheExpectedFigureUntilTheDrawerIsCounted() {
        branch.setTillBlindCount(true);
        openSessionWith(new BigDecimal("20.000"));
        takings("47.500", "132.000");

        TillStateResponse state = tillService.state(2L);

        assertThat(state.open()).isTrue();
        assertThat(state.cashTaken()).isNull();
        assertThat(state.expectedCash()).isNull();
        // Card takings say nothing about what is in the drawer, so they stay visible.
        assertThat(state.cardTaken()).isEqualByComparingTo("132.000");
    }

    @Test
    void aCafeCountingWithTheNumberInViewSeesIt() {
        branch.setTillBlindCount(false);
        openSessionWith(new BigDecimal("20.000"));
        takings("47.500", "0");

        TillStateResponse state = tillService.state(2L);

        assertThat(state.cashTaken()).isEqualByComparingTo("47.500");
        assertThat(state.expectedCash()).isEqualByComparingTo("67.500");
    }

    @Test
    void staffWithoutPaymentsSeeThatTheShopIsOpenAndNoneOfItsMoney() {
        authenticate(EnumSet.of(Permission.ORDERS));
        branch.setTillBlindCount(false);
        openSessionWith(new BigDecimal("20.000"));
        takings("47.500", "132.000");
        when(branchService.canOrderNow(branch)).thenReturn(true);

        TillStateResponse state = tillService.state(2L);

        assertThat(state.open()).isTrue();
        assertThat(state.acceptingOrders()).isTrue();
        assertThat(state.cashTaken()).isNull();
        assertThat(state.cardTaken()).isNull();
        assertThat(state.expectedCash()).isNull();
        assertThat(state.lastClose()).isNull();
    }

    @Test
    void tomorrowsFloatIsOfferedFromTonightsCountOnlyWhenTheCafeCarriesItsChange() {
        TillSession lastNight = new TillSession();
        lastNight.setBranchId(2L);
        lastNight.setOpenedAt(Instant.now().minus(1, ChronoUnit.DAYS));
        lastNight.setClosedAt(Instant.now().minus(8, ChronoUnit.HOURS));
        lastNight.setCountedCash(new BigDecimal("35.000"));
        when(sessions.findFirstByBranchIdAndClosedAtIsNotNullOrderByClosedAtDesc(2L))
                .thenReturn(Optional.of(lastNight));
        when(sessions.findFirstByBranchIdAndClosedAtIsNull(2L)).thenReturn(Optional.empty());

        branch.setTillCarryFloat(true);
        assertThat(tillService.state(2L).suggestedFloat()).isEqualByComparingTo("35.000");

        // The café that banks the lot every night starts from an empty box instead.
        branch.setTillCarryFloat(false);
        assertThat(tillService.state(2L).suggestedFloat()).isNull();
    }

    @Test
    void aBranchThatOptedOutOfTheDrawerReadsAsOpen() {
        branch.setTillEnabled(false);
        when(sessions.findFirstByBranchIdAndClosedAtIsNull(2L)).thenReturn(Optional.empty());
        when(sessions.findFirstByBranchIdAndClosedAtIsNotNullOrderByClosedAtDesc(2L))
                .thenReturn(Optional.empty());

        TillStateResponse state = tillService.state(2L);

        assertThat(state.tillEnabled()).isFalse();
        assertThat(state.open()).isTrue();
        assertThat(state.session()).isNull();
    }

    @Test
    void theHistoryIsCappedSoOneBranchCannotAskForEverySessionItEverRan() {
        when(sessions.findByBranchIdOrderByOpenedAtDesc(eq(2L), any(Pageable.class))).thenReturn(List.of());

        assertThat(tillService.history(2L)).isEmpty();
    }

    // ---------------- helpers ----------------

    private void openSessionWith(BigDecimal openingFloat) {
        TillSession session = new TillSession();
        session.setId(9L);
        session.setRestaurantId(1L);
        session.setBranchId(2L);
        session.setOpenedAt(Instant.now().minus(6, ChronoUnit.HOURS));
        session.setOpeningFloat(openingFloat);
        when(sessions.findFirstByBranchIdAndClosedAtIsNull(2L)).thenReturn(Optional.of(session));
    }

    /** What the two payment methods took, in the shape the repository hands back. */
    private void takings(String cash, String card) {
        when(paymentRepository.takenByMethodBetween(eq(2L), any(), any())).thenReturn(List.of(
                new Object[]{"CASH", new BigDecimal(cash)},
                new Object[]{"CARD", new BigDecimal(card)}));
    }

    private void authenticate(Set<Permission> permissions) {
        CustomUserDetails principal = new CustomUserDetails(
                7L, "user7", "h", EnumSet.copyOf(permissions), false, 1L, null, true);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }
}
