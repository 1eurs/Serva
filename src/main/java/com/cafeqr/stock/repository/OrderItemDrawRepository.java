package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.OrderItemDraw;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface OrderItemDrawRepository extends JpaRepository<OrderItemDraw, Long> {

    List<OrderItemDraw> findByOrderItemIdIn(Collection<Long> orderItemIds);

    void deleteByOrderItemIdIn(Collection<Long> orderItemIds);

    /**
     * How much has come out of one tin through sales since a moment — the moment being the last
     * time somebody counted it. Draws are deleted on cancel, so a cancelled order never counts.
     */
    @Query("""
            select coalesce(sum(d.quantity), 0)
            from OrderItemDraw d, OrderItem oi, Order o
            where d.orderItemId = oi.id and oi.order = o
              and d.stockItemId = :tin and o.stockDrawnAt >= :since
            """)
    BigDecimal usedSince(@Param("tin") Long stockItemId, @Param("since") Instant since);
}
