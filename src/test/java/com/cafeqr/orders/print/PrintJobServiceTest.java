package com.cafeqr.orders.print;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.print.domain.PrintJob;
import com.cafeqr.orders.print.domain.PrintJobStatus;
import com.cafeqr.orders.print.dto.EnqueueResponse;
import com.cafeqr.orders.print.dto.PrintJobResponse;
import com.cafeqr.orders.print.domain.PrintStation;
import com.cafeqr.orders.print.repository.PrintJobRepository;
import com.cafeqr.orders.print.repository.PrintStationRepository;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.tables.TableService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The queue's promises, one per test: nothing enqueues without a printer, an order is never
 * queued twice, a stale job is expired rather than printed on tablet wake, an ack is safe to
 * repeat, and a device with no printer is told honestly whether anyone is collecting.
 */
@ExtendWith(MockitoExtension.class)
class PrintJobServiceTest {

    @Mock private PrintJobRepository printJobRepository;
    @Mock private PrintStationRepository printStationRepository;
    @Mock private OrderRepository orderRepository;
    @Mock private BranchService branchService;
    @Mock private RestaurantService restaurantService;
    @Mock private TableService tableService;
    @Mock private AccessGuard accessGuard;

    private PrintJobService service;

    @BeforeEach
    void setUp() {
        service = new PrintJobService(printJobRepository, printStationRepository, orderRepository, branchService,
                restaurantService, tableService, accessGuard);
        lenient().when(restaurantService.getEntity(1L)).thenReturn(cafe());
    }

    private static Order order() {
        Order o = new Order();
        o.setId(7L);
        o.setRestaurantId(1L);
        o.setBranchId(5L);
        o.setItems(new ArrayList<>());
        return o;
    }

    private static Restaurant cafe() {
        Restaurant r = new Restaurant();
        r.setId(1L);
        r.setNameEn("Verify Cafe");
        return r;
    }

    private static Branch branch(boolean printer) {
        Branch b = new Branch();
        b.setId(5L);
        b.setRestaurantId(1L);
        b.setPrinterEnabled(printer);
        return b;
    }

    private static PrintJob job(long id, Instant createdAt) {
        PrintJob j = new PrintJob();
        j.setId(id);
        j.setRestaurantId(1L);
        j.setBranchId(5L);
        j.setOrderId(7L);
        j.setStatus(PrintJobStatus.PENDING);
        j.setCreatedAt(createdAt);
        return j;
    }

    @Test
    void doesNotEnqueueWhenTheBranchHasNoPrinter() {
        when(branchService.getEntity(5L)).thenReturn(branch(false));

        service.enqueueIfEnabled(order());

        verify(printJobRepository, never()).save(any());
    }

    @Test
    void enqueuesAnOrderOnceWhileItsJobIsStillPending() {
        when(branchService.getEntity(5L)).thenReturn(branch(true));
        when(printJobRepository.findFirstByOrderIdAndStatus(7L, PrintJobStatus.PENDING))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(job(1L, Instant.now())));
        when(printJobRepository.save(any(PrintJob.class))).thenAnswer(inv -> inv.getArgument(0));

        service.enqueueIfEnabled(order());
        service.enqueueIfEnabled(order()); // e.g. the same order tapped twice on an iPad

        verify(printJobRepository, times(1)).save(any(PrintJob.class));
    }

    @Test
    void aStaleJobIsExpiredOnPullInsteadOfPrintedLate() {
        when(branchService.getEntity(5L)).thenReturn(branch(true));
        PrintJob stale = job(1L, Instant.now().minus(Duration.ofMinutes(20)));
        PrintJob fresh = job(2L, Instant.now().minus(Duration.ofMinutes(1)));
        when(printJobRepository.findByBranchIdAndStatusOrderByIdAsc(5L, PrintJobStatus.PENDING))
                .thenReturn(List.of(stale, fresh));
        when(printJobRepository.claim(eq(2L), eq("st-one"), any(), any(), eq(PrintJobStatus.PENDING))).thenReturn(1);
        when(orderRepository.findById(7L)).thenReturn(Optional.of(order()));

        List<PrintJobResponse> offered = service.pull(5L, "st-one");

        assertThat(offered).extracting(PrintJobResponse::id).containsExactly(2L);
        // One pull is all a headless station gets — it must carry the café's slip settings.
        assertThat(offered.get(0).receipt().nameEn()).isEqualTo("Verify Cafe");
        assertThat(stale.getStatus()).isEqualTo(PrintJobStatus.EXPIRED);
        assertThat(fresh.getStatus()).isEqualTo(PrintJobStatus.PENDING); // only an ack clears it
        verify(printJobRepository, never()).claim(eq(1L), any(), any(), any(), any()); // never claim what expired
        verify(printStationRepository).touch(1L, 5L, "st-one"); // the pull is the liveness signal
    }

    @Test
    void aDeletedTableDoesNotCostTheCafeItsTicket() {
        when(branchService.getEntity(5L)).thenReturn(branch(true));
        Order withTable = order();
        withTable.setTableId(99L);
        when(printJobRepository.findByBranchIdAndStatusOrderByIdAsc(5L, PrintJobStatus.PENDING))
                .thenReturn(List.of(job(1L, Instant.now())));
        when(printJobRepository.claim(eq(1L), eq("st-one"), any(), any(), any())).thenReturn(1);
        when(orderRepository.findById(7L)).thenReturn(Optional.of(withTable));
        when(tableService.getEntity(99L)).thenThrow(new IllegalStateException("table deleted"));

        List<PrintJobResponse> offered = service.pull(5L, "st-one");

        assertThat(offered).hasSize(1);
        assertThat(offered.get(0).receipt().tableNumber()).isNull(); // prints without the table line
    }

    @Test
    void aJobAnotherStationHoldsIsNotOffered() {
        when(branchService.getEntity(5L)).thenReturn(branch(true));
        PrintJob theirs = job(1L, Instant.now());
        PrintJob free = job(2L, Instant.now());
        when(printJobRepository.findByBranchIdAndStatusOrderByIdAsc(5L, PrintJobStatus.PENDING)).thenReturn(List.of(theirs, free));
        when(printJobRepository.claim(eq(1L), eq("st-two"), any(), any(), any())).thenReturn(0); // lease live elsewhere
        when(printJobRepository.claim(eq(2L), eq("st-two"), any(), any(), any())).thenReturn(1);
        when(orderRepository.findById(7L)).thenReturn(Optional.of(order()));

        List<PrintJobResponse> offered = service.pull(5L, "st-two");

        assertThat(offered).extracting(PrintJobResponse::id).containsExactly(2L);
    }

    @Test
    void pullRejectsAStationIdItCannotTrust() {
        assertThatThrownBy(() -> service.pull(5L, "st one; drop table")).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.pull(5L, "")).isInstanceOf(BadRequestException.class);
        verify(printStationRepository, never()).touch(any(), any(), any());
    }

    @Test
    void theReadOnlyViewChangesNothing() {
        when(branchService.getEntity(5L)).thenReturn(branch(true));
        PrintJob stale = job(1L, Instant.now().minus(Duration.ofMinutes(20)));
        PrintJob fresh = job(2L, Instant.now());
        when(printJobRepository.findByBranchIdAndStatusOrderByIdAsc(5L, PrintJobStatus.PENDING)).thenReturn(List.of(stale, fresh));
        when(orderRepository.findById(7L)).thenReturn(Optional.of(order()));

        List<PrintJobResponse> shown = service.pendingForBranch(5L);

        assertThat(shown).extracting(PrintJobResponse::id).containsExactly(2L);
        assertThat(stale.getStatus()).isEqualTo(PrintJobStatus.PENDING); // not expired by a look
        verify(printJobRepository, never()).claim(any(), any(), any(), any(), any());
        verify(printStationRepository, never()).touch(any(), any(), any());
    }

    @Test
    void theSweepRetiresJobsNobodyCameFor() {
        // The café with auto-print on and no station never calls pull(), so this is the only
        // thing that stops its PENDING rows growing for the life of the café.
        var sweep = new PrintJobSweepJob(printJobRepository, 60);
        when(printJobRepository.expireOlderThan(any(), eq(PrintJobStatus.PENDING), eq(PrintJobStatus.EXPIRED))).thenReturn(3);

        sweep.run();

        verify(printJobRepository).expireOlderThan(any(), eq(PrintJobStatus.PENDING), eq(PrintJobStatus.EXPIRED));
    }

    @Test
    void acknowledgingTwiceIsHarmless() {
        PrintJob job = job(1L, Instant.now());
        when(printJobRepository.findById(1L)).thenReturn(Optional.of(job));

        service.acknowledge(1L);
        Instant first = job.getPrintedAt();
        service.acknowledge(1L);

        assertThat(job.getStatus()).isEqualTo(PrintJobStatus.PRINTED);
        assertThat(job.getPrintedAt()).isEqualTo(first);
    }

    @Test
    void onDemandEnqueueSaysWhetherAnyoneIsCollecting() {
        when(orderRepository.findById(7L)).thenReturn(Optional.of(order()));
        when(printJobRepository.findFirstByOrderIdAndStatus(7L, PrintJobStatus.PENDING)).thenReturn(Optional.empty());
        when(printJobRepository.save(any(PrintJob.class))).thenAnswer(inv -> {
            PrintJob j = inv.getArgument(0);
            j.setId(9L);
            return j;
        });
        when(printStationRepository.countByBranchIdAndLastSeenAtAfter(eq(5L), any())).thenReturn(0L).thenReturn(1L);

        EnqueueResponse quiet = service.enqueueOnDemand(7L);
        assertThat(quiet.jobId()).isEqualTo(9L);
        assertThat(quiet.stationCollecting()).isFalse(); // nobody has polled this branch lately

        when(printJobRepository.findFirstByOrderIdAndStatus(7L, PrintJobStatus.PENDING)).thenReturn(Optional.of(job(9L, Instant.now())));
        EnqueueResponse live = service.enqueueOnDemand(7L);
        assertThat(live.jobId()).isEqualTo(9L); // same job, not a second one
        assertThat(live.stationCollecting()).isTrue();
    }

    @Test
    void statusCountsTheStationsSeenLately() {
        when(branchService.getEntity(5L)).thenReturn(branch(true));
        when(printStationRepository.countByBranchIdAndLastSeenAtAfter(eq(5L), any())).thenReturn(2L);
        PrintStation last = new PrintStation();
        last.setLastSeenAt(Instant.now());
        when(printStationRepository.findFirstByBranchIdOrderByLastSeenAtDesc(5L)).thenReturn(Optional.of(last));
        when(printJobRepository.countByBranchIdAndStatusAndCreatedAtAfter(eq(5L), eq(PrintJobStatus.PENDING), any())).thenReturn(3L);

        var status = service.stationStatus(5L);

        assertThat(status.collecting()).isTrue();
        assertThat(status.stations()).isEqualTo(2L); // worth a warning, no longer a duplicate
        assertThat(status.pending()).isEqualTo(3L);
    }

    @Test
    void statusReportsHowLongTicketsHaveWaitedEvenWhileAStationIsCollecting() {
        // The failure this exists for: the station is alive and polling, but its printer is
        // dead, so it collects and never prints. "collecting" stays true and the café would
        // otherwise be told nothing at all.
        when(branchService.getEntity(5L)).thenReturn(branch(true));
        when(printStationRepository.countByBranchIdAndLastSeenAtAfter(eq(5L), any())).thenReturn(1L);
        PrintStation live = new PrintStation();
        live.setLastSeenAt(Instant.now());
        when(printStationRepository.findFirstByBranchIdOrderByLastSeenAtDesc(5L)).thenReturn(Optional.of(live));
        when(printJobRepository.countByBranchIdAndStatusAndCreatedAtAfter(eq(5L), eq(PrintJobStatus.PENDING), any())).thenReturn(4L);
        when(printJobRepository.findFirstByBranchIdAndStatusAndCreatedAtAfterOrderByCreatedAtAsc(eq(5L), eq(PrintJobStatus.PENDING), any()))
                .thenReturn(Optional.of(job(1L, Instant.now().minus(Duration.ofMinutes(4)))));

        var status = service.stationStatus(5L);

        assertThat(status.collecting()).isTrue();                 // the station is fine
        assertThat(status.oldestPendingSeconds()).isGreaterThan(200);  // the printing is not
    }

    @Test
    void nothingWaitingMeansZeroSecondsWaited() {
        when(branchService.getEntity(5L)).thenReturn(branch(true));
        when(printStationRepository.countByBranchIdAndLastSeenAtAfter(eq(5L), any())).thenReturn(1L);
        when(printStationRepository.findFirstByBranchIdOrderByLastSeenAtDesc(5L)).thenReturn(Optional.empty());
        when(printJobRepository.countByBranchIdAndStatusAndCreatedAtAfter(eq(5L), eq(PrintJobStatus.PENDING), any())).thenReturn(0L);
        when(printJobRepository.findFirstByBranchIdAndStatusAndCreatedAtAfterOrderByCreatedAtAsc(eq(5L), eq(PrintJobStatus.PENDING), any()))
                .thenReturn(Optional.empty());

        assertThat(service.stationStatus(5L).oldestPendingSeconds()).isZero();
    }

    @Test
    void onDemandEnqueueIsGuardedByBranchAccess() {
        when(orderRepository.findById(7L)).thenReturn(Optional.of(order()));
        doThrow(new AccessDeniedException("no")).when(accessGuard).requireBranchAccess(eq(1L), eq(5L));

        assertThatThrownBy(() -> service.enqueueOnDemand(7L)).isInstanceOf(AccessDeniedException.class);
        verify(printJobRepository, never()).save(any());
    }
}
