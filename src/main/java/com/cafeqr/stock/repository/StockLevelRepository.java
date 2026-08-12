package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.StockLevel;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StockLevelRepository extends JpaRepository<StockLevel, StockLevel.Key> {

    List<StockLevel> findByBranchId(Long branchId);

    List<StockLevel> findByBranchIdAndStockItemIdIn(Long branchId, List<Long> stockItemIds);

    Optional<StockLevel> findByStockItemIdAndBranchId(Long stockItemId, Long branchId);

    /**
     * Locking read used on every consumption path. Two orders drawing the same ingredient
     * serialize here, so the cached balance can never drift from the ledger.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from StockLevel l where l.stockItemId = :stockItemId and l.branchId = :branchId")
    Optional<StockLevel> lock(@Param("stockItemId") Long stockItemId, @Param("branchId") Long branchId);

    /**
     * Creates the (item, branch) row only if absent, atomically. Two concurrent first-ever
     * movements for the same pair would otherwise race into a duplicate-key failure; the loser
     * here is a no-op and its following {@link #lock} finds the row.
     */
    @Modifying
    @Query(value = """
            INSERT INTO stock_levels (stock_item_id, branch_id, quantity_base, updated_at)
            VALUES (:stockItemId, :branchId, 0, now())
            ON CONFLICT (stock_item_id, branch_id) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("stockItemId") Long stockItemId, @Param("branchId") Long branchId);

    void deleteByStockItemId(Long stockItemId);
}
