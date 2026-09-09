package com.cafeqr.orders.print.repository;

import com.cafeqr.orders.print.domain.PrintJob;
import com.cafeqr.orders.print.domain.PrintJobStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface PrintJobRepository extends JpaRepository<PrintJob, Long> {

    List<PrintJob> findByBranchIdAndStatusOrderByIdAsc(Long branchId, PrintJobStatus status);

    Optional<PrintJob> findFirstByOrderIdAndStatus(Long orderId, PrintJobStatus status);

    /** Only jobs young enough to still print — stale ones are expired lazily on the next poll. */
    long countByBranchIdAndStatusAndCreatedAtAfter(Long branchId, PrintJobStatus status, Instant after);

    /** The longest-waiting live job, which is how long the café has been missing tickets. */
    Optional<PrintJob> findFirstByBranchIdAndStatusAndCreatedAtAfterOrderByCreatedAtAsc(
            Long branchId, PrintJobStatus status, Instant after);

    /**
     * Compare-and-set claim. Returns 1 when this station now holds the job — it was free, or
     * already this station's, or the previous holder's lease has lapsed — and 0 when another
     * station's lease is still live. Two stations pulling at once cannot both get 1.
     */
    /**
     * Retire jobs nobody came for. {@code pull} expires the ones it walks past, but a branch
     * with auto-print on and no station running never calls it — so without this every order
     * such a café takes leaves a PENDING row behind forever, and the partial index those
     * pulls rely on grows with them.
     */
    @Modifying
    @Query("UPDATE PrintJob j SET j.status = :expired WHERE j.status = :pending AND j.createdAt < :cutoff")
    int expireOlderThan(@Param("cutoff") Instant cutoff,
                        @Param("pending") PrintJobStatus pending,
                        @Param("expired") PrintJobStatus expired);

    @Modifying
    @Query("""
            UPDATE PrintJob j SET j.claimedBy = :stationId, j.claimedAt = :now
            WHERE j.id = :id AND j.status = :pending
              AND (j.claimedBy IS NULL OR j.claimedBy = :stationId OR j.claimedAt < :leaseCutoff)
            """)
    int claim(@Param("id") Long id, @Param("stationId") String stationId, @Param("now") Instant now,
              @Param("leaseCutoff") Instant leaseCutoff, @Param("pending") PrintJobStatus pending);
}
