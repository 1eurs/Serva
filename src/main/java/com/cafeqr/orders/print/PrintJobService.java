package com.cafeqr.orders.print;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.dto.OrderResponse;
import com.cafeqr.orders.print.domain.PrintJob;
import com.cafeqr.orders.print.domain.PrintStation;
import com.cafeqr.orders.print.domain.PrintJobStatus;
import com.cafeqr.orders.print.dto.EnqueueResponse;
import com.cafeqr.orders.print.dto.ReceiptContext;
import com.cafeqr.orders.print.dto.PrintJobResponse;
import com.cafeqr.orders.print.dto.StationStatusResponse;
import com.cafeqr.orders.print.repository.PrintJobRepository;
import com.cafeqr.orders.print.repository.PrintStationRepository;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.tables.TableService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

@Service
public class PrintJobService {

    /**
     * A pending job older than this is expired instead of printed — a tablet waking after a
     * long sleep must not print a stack of receipts for orders picked up half an hour ago.
     */
    private static final Duration FRESHNESS_WINDOW = Duration.ofMinutes(15);

    /** A station polls every 5s; three missed polls and it is not collecting. */
    private static final Duration STATION_LIVE_WINDOW = Duration.ofSeconds(15);

    /**
     * How long a station's claim on a job holds before another station may take it. Long
     * enough to cover a slow Bluetooth print and the ack after it; short enough that a tablet
     * that died mid-print does not hold the ticket hostage.
     */
    private static final Duration CLAIM_LEASE = Duration.ofSeconds(60);

    /** Minted in the browser, so it is validated, not trusted. */
    private static final Pattern STATION_ID = Pattern.compile("[A-Za-z0-9_-]{4,64}");

    private final PrintJobRepository printJobRepository;
    private final PrintStationRepository printStationRepository;
    private final OrderRepository orderRepository;
    private final BranchService branchService;
    private final RestaurantService restaurantService;
    private final TableService tableService;
    private final AccessGuard accessGuard;

    public PrintJobService(PrintJobRepository printJobRepository,
                           PrintStationRepository printStationRepository,
                           OrderRepository orderRepository,
                           BranchService branchService,
                           RestaurantService restaurantService,
                           TableService tableService,
                           AccessGuard accessGuard) {
        this.printJobRepository = printJobRepository;
        this.printStationRepository = printStationRepository;
        this.orderRepository = orderRepository;
        this.branchService = branchService;
        this.restaurantService = restaurantService;
        this.tableService = tableService;
        this.accessGuard = accessGuard;
    }

    /** The café's slip settings plus this order's table, resolved once per job. */
    private ReceiptContext receiptFor(Order order) {
        String tableNumber = null;
        if (order.getTableId() != null) {
            try {
                tableNumber = tableService.getEntity(order.getTableId()).getTableNumber();
            } catch (RuntimeException e) {
                tableNumber = null; // a deleted table must not cost the café its ticket
            }
        }
        return ReceiptContext.of(restaurantService.getEntity(order.getRestaurantId()), tableNumber);
    }

    /**
     * Called from the order-creation paths inside the same transaction — the job row commits
     * atomically with the order, so the ticket is durable before the SSE event that announces
     * it. That is the whole point of the queue: a print station that is asleep, reloading, or
     * off the Wi-Fi collects the job when it comes back, where the old board-diff trigger
     * simply never saw the order and lost the ticket in silence.
     *
     * No-op when the branch hasn't enabled auto-print.
     */
    @Transactional
    public void enqueueIfEnabled(Order order) {
        if (!branchService.getEntity(order.getBranchId()).isPrinterEnabled()) {
            return;
        }
        enqueue(order);
    }

    /**
     * "Somebody asked for this to be printed" — the path a device with no printer of its own
     * takes to hand the job to the branch's print station: an iPad completing an order, or a
     * reprint tapped on a laptop. Deliberately ignores the branch's auto-print switch, because
     * a person tapping print is a different question from whether receipts print by themselves.
     */
    @Transactional
    public EnqueueResponse enqueueOnDemand(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> ResourceNotFoundException.of("Order", orderId));
        accessGuard.requireBranchAccess(order.getRestaurantId(), order.getBranchId());
        PrintJob job = enqueue(order);
        StationStatusResponse status = statusOf(order.getBranchId());
        return new EnqueueResponse(job.getId(), status.stationSeenAt(), status.collecting());
    }

    /** For the settings page and the shell's warning: is anyone collecting, is anything waiting. */
    @Transactional(readOnly = true)
    public StationStatusResponse stationStatus(Long branchId) {
        var branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        return statusOf(branchId);
    }

    private StationStatusResponse statusOf(Long branchId) {
        Instant now = Instant.now();
        long stations = printStationRepository.countByBranchIdAndLastSeenAtAfter(branchId, now.minus(STATION_LIVE_WINDOW));
        Instant seen = printStationRepository.findFirstByBranchIdOrderByLastSeenAtDesc(branchId)
                .map(PrintStation::getLastSeenAt).orElse(null);
        Instant fresh = now.minus(FRESHNESS_WINDOW);
        long pending = printJobRepository.countByBranchIdAndStatusAndCreatedAtAfter(
                branchId, PrintJobStatus.PENDING, fresh);
        long oldest = printJobRepository
                .findFirstByBranchIdAndStatusAndCreatedAtAfterOrderByCreatedAtAsc(branchId, PrintJobStatus.PENDING, fresh)
                .map(job -> Duration.between(job.getCreatedAt(), now).getSeconds())
                .orElse(0L);
        boolean appCollecting = printStationRepository
                .findByBranchIdAndLastSeenAtAfter(branchId, now.minus(STATION_LIVE_WINDOW))
                .stream()
                .map(PrintStation::getStationId)
                .anyMatch(id -> id != null && !id.startsWith("st-"));
        return new StationStatusResponse(seen, stations > 0, stations, pending, Math.max(0, oldest), appCollecting);
    }

    /**
     * What a print station calls every few seconds. Records that this device is collecting,
     * expires anything too old to be worth paper, then CLAIMS each remaining job for this
     * station before handing it over — so a second tablet flagged as the station gets an
     * empty answer for jobs this one holds, and a job whose holder died mid-print comes back
     * once the lease lapses. A job stays PENDING throughout: only the ack ends it.
     */
    @Transactional
    public List<PrintJobResponse> pull(Long branchId, String stationId) {
        if (stationId == null || !STATION_ID.matcher(stationId).matches()) {
            throw new BadRequestException("stationId must be 4–64 characters of letters, digits, _ or -");
        }
        var branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        printStationRepository.touch(branch.getRestaurantId(), branchId, stationId);

        Instant now = Instant.now();
        Instant fresh = now.minus(FRESHNESS_WINDOW);
        List<PrintJob> candidates = new ArrayList<>();
        for (PrintJob job : printJobRepository.findByBranchIdAndStatusOrderByIdAsc(branchId, PrintJobStatus.PENDING)) {
            if (job.getCreatedAt().isBefore(fresh)) {
                job.setStatus(PrintJobStatus.EXPIRED);
            } else {
                candidates.add(job);
            }
        }
        // The expiries are dirty entities and the claims are bulk updates on the same table;
        // flushing here keeps the two from ever writing over each other.
        printJobRepository.flush();

        Instant leaseCutoff = now.minus(CLAIM_LEASE);
        List<PrintJobResponse> offered = new ArrayList<>();
        for (PrintJob job : candidates) {
            if (printJobRepository.claim(job.getId(), stationId, now, leaseCutoff, PrintJobStatus.PENDING) == 0) {
                continue; // another station is printing it, and its lease is still live
            }
            orderRepository.findById(job.getOrderId()).ifPresentOrElse(
                    order -> offered.add(PrintJobResponse.of(job, OrderResponse.from(order), receiptFor(order))),
                    () -> job.setStatus(PrintJobStatus.EXPIRED)); // no order left to print — leave the pending index
        }
        return offered;
    }

    /** Idempotent per order: a second request while one is still pending returns the first. */
    private PrintJob enqueue(Order order) {
        return printJobRepository.findFirstByOrderIdAndStatus(order.getId(), PrintJobStatus.PENDING)
                .orElseGet(() -> {
                    PrintJob job = new PrintJob();
                    job.setRestaurantId(order.getRestaurantId());
                    job.setBranchId(order.getBranchId());
                    job.setOrderId(order.getId());
                    job.setStatus(PrintJobStatus.PENDING);
                    return printJobRepository.save(job);
                });
    }

    /**
     * A read-only look at what is waiting — for the settings page, and for a human with curl.
     * Deliberately changes nothing: it does not count as a station, claims nothing, and
     * expires nothing. Stations use {@link #pull}.
     */
    @Transactional(readOnly = true)
    public List<PrintJobResponse> pendingForBranch(Long branchId) {
        var branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        Instant cutoff = Instant.now().minus(FRESHNESS_WINDOW);
        return printJobRepository.findByBranchIdAndStatusOrderByIdAsc(branchId, PrintJobStatus.PENDING)
                .stream()
                .filter(job -> !job.getCreatedAt().isBefore(cutoff))
                .map(job -> orderRepository.findById(job.getOrderId())
                        .map(order -> PrintJobResponse.of(job, OrderResponse.from(order), receiptFor(order)))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    /** Idempotent — acking an already-printed or expired job is a harmless no-op. */
    @Transactional
    public void acknowledge(Long jobId) {
        PrintJob job = printJobRepository.findById(jobId)
                .orElseThrow(() -> ResourceNotFoundException.of("PrintJob", jobId));
        accessGuard.requireBranchAccess(job.getRestaurantId(), job.getBranchId());
        if (job.getStatus() == PrintJobStatus.PENDING) {
            job.setStatus(PrintJobStatus.PRINTED);
            job.setPrintedAt(Instant.now());
        }
    }
}
