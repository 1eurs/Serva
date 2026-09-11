package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.StockItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StockItemRepository extends JpaRepository<StockItem, Long> {

    /**
     * Everything one shop holds. Ordered by id, not by name: a name sorts differently in
     * Arabic than in English and the browser knows which language is on screen, so the wall
     * does that sort itself against the name it is actually showing.
     */
    List<StockItem> findByBranchIdOrderByIdAsc(Long branchId);
}
