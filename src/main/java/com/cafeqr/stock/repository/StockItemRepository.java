package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockKind;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StockItemRepository extends JpaRepository<StockItem, Long> {

    List<StockItem> findByRestaurantIdAndArchivedFalseOrderByNameEnAsc(Long restaurantId);

    List<StockItem> findByRestaurantIdOrderByNameEnAsc(Long restaurantId);

    List<StockItem> findByRestaurantIdAndKindAndArchivedFalseOrderByNameEnAsc(Long restaurantId, StockKind kind);

    List<StockItem> findByIdInAndRestaurantId(List<Long> ids, Long restaurantId);

    boolean existsByRestaurantIdAndNameEnIgnoreCaseAndArchivedFalse(Long restaurantId, String nameEn);
}
