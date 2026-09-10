package com.cafeqr.payments.repository;

import com.cafeqr.payments.domain.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.time.Instant;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    List<Payment> findByOrderIdOrderByIdDesc(Long orderId);

    /**
     * Paid revenue per method, for the dashboard's cash-vs-card card.
     *
     * <p>An order can carry several payment rows for two very different reasons: it was marked
     * paid twice (only the last one is real), or it was split between people (all of them are).
     * Grouping by settlement tells those apart — the newest row names the settlement that
     * counts, and every row in it is summed. A row with no settlement id settled its order
     * alone, which is every plain mark-paid.
     */
    @Query(value = """
            WITH scoped AS (
                SELECT p.id,
                       p.order_id,
                       p.method,
                       p.amount,
                       COALESCE(p.settlement_id, p.id) AS settlement
                FROM payments p
                JOIN orders o ON o.id = p.order_id
                WHERE o.restaurant_id = :restaurantId
                  AND (:branchId IS NULL OR o.branch_id = :branchId)
                  AND o.created_at >= :from
                  AND o.created_at < :to
                  AND p.status = 'PAID'
                  AND p.method IN ('CASH', 'CARD')
            ),
            latest AS (
                SELECT DISTINCT ON (order_id) order_id, settlement
                FROM scoped
                ORDER BY order_id, id DESC
            )
            SELECT s.method,
                   COUNT(*) AS payment_count,
                   COALESCE(SUM(s.amount), 0) AS revenue
            FROM scoped s
            JOIN latest l ON l.order_id = s.order_id AND l.settlement = s.settlement
            GROUP BY s.method
            ORDER BY s.method
            """, nativeQuery = true)
    List<Object[]> revenueByMethod(@Param("restaurantId") Long restaurantId,
                                   @Param("branchId") Long branchId,
                                   @Param("from") Instant from,
                                   @Param("to") Instant to);
}
