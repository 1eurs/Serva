package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.MovementReason;
import com.cafeqr.stock.domain.StockMovement;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {

    Page<StockMovement> findByBranchIdOrderByCreatedAtDesc(Long branchId, Pageable pageable);

    Page<StockMovement> findByBranchIdAndStockItemIdOrderByCreatedAtDesc(
            Long branchId, Long stockItemId, Pageable pageable);

    List<StockMovement> findByOrderIdAndReason(Long orderId, MovementReason reason);

    boolean existsByOrderIdAndReason(Long orderId, MovementReason reason);

    /**
     * Total drawn per item over a window, as {@code [stockItemId, quantity]} rows. Feeds the
     * days-of-cover projection: average daily usage is this divided by the window length.
     * Only SALE and PREP_CONSUME count as usage — waste and transfers are not demand.
     */
    @Query("""
            select m.stockItemId, sum(-m.deltaBase)
            from StockMovement m
            where m.branchId = :branchId
              and m.createdAt >= :since
              and m.reason in (com.cafeqr.stock.domain.MovementReason.SALE,
                               com.cafeqr.stock.domain.MovementReason.PREP_CONSUME)
            group by m.stockItemId
            """)
    List<Object[]> usageSince(@Param("branchId") Long branchId, @Param("since") Instant since);

    /** Waste totals per item over a window, valued at the recorded unit cost. */
    @Query("""
            select m.stockItemId, sum(-m.deltaBase), sum(-m.deltaBase * coalesce(m.unitCost, 0))
            from StockMovement m
            where m.branchId = :branchId
              and m.createdAt >= :since
              and m.reason = com.cafeqr.stock.domain.MovementReason.WASTE
            group by m.stockItemId
            """)
    List<Object[]> wasteSince(@Param("branchId") Long branchId, @Param("since") Instant since);

    /**
     * When each item was last physically counted, as {@code [stockItemId, lastCountedAt]}.
     * Drives the cycle-count rotation: an item is due when this is older than its
     * {@code countFrequency}, or missing entirely.
     */
    @Query("""
            select m.stockItemId, max(m.createdAt)
            from StockMovement m
            where m.branchId = :branchId
              and m.reason = com.cafeqr.stock.domain.MovementReason.COUNT
            group by m.stockItemId
            """)
    List<Object[]> lastCountedAt(@Param("branchId") Long branchId);

    /** Most recent RECEIVE unit cost per item — used to spot cost inflation against the average. */
    @Query("""
            select m from StockMovement m
            where m.stockItemId = :stockItemId
              and m.reason = com.cafeqr.stock.domain.MovementReason.RECEIVE
              and m.unitCost is not null
            order by m.createdAt desc
            """)
    List<StockMovement> recentReceipts(@Param("stockItemId") Long stockItemId, Pageable pageable);
}
