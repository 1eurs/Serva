package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.StockItem;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StockItemRepository extends JpaRepository<StockItem, Long> {

    /**
     * Everything one shop holds. Ordered by id, not by name: a name sorts differently in
     * Arabic than in English and the browser knows which language is on screen, so the wall
     * does that sort itself against the name it is actually showing.
     */
    List<StockItem> findByBranchIdOrderByIdAsc(Long branchId);

    List<StockItem> findByIdIn(Collection<Long> ids);

    /**
     * The row, locked until the transaction ends.
     *
     * <p>Two orders for the last croissant can be accepted in the same second. Without the lock
     * both read 1, both take 1, and the second write trips the {@code quantity >= 0} check and
     * fails an order that should simply have got nothing. With it, the second waits, reads 0 and
     * takes 0 — which is the truth.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from StockItem s where s.id = :id")
    Optional<StockItem> findByIdForUpdate(@Param("id") Long id);
}
